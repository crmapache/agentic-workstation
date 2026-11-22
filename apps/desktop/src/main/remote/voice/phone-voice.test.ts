import { it, vi, expect, describe } from 'vitest'

import type { VoiceCallView, VoiceStartOutcome } from '@shared/voice'

import type { VoiceMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { decodeAudio } from '@agentic-workstation/remote-protocol/audio-frame'

import type { VoicePort } from '../bridge/bridge-ports'
import type { VoiceEndpoint } from '../../voice/call/voice-endpoint'
import { AnswerChunks, ANSWER_CHUNK_BYTES } from './answer-chunks'
import { PhoneVoiceDesk, SILENT_LINE_MS } from './phone-voice'

const VIEW: VoiceCallView = {
  id: 'call1',
  conversationId: 'c1',
  provider: 'claude',
  origin: 'phone',
  state: 'listening',
  tool: null,
  heard: '',
  muted: false,
  language: null,
  agentBusy: false,
  startedAt: 0,
}

const setup = (outcome: VoiceStartOutcome = { ok: true, call: VIEW }) => {
  const sent: VoiceMessage[] = []
  const streamed: Uint8Array[] = []
  const timers: Array<{ run: () => void; ms: number }> = []
  const call = {
    mic: vi.fn(),
    stop: vi.fn(),
    mute: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    played: vi.fn(),
    end: vi.fn(),
    lineLost: vi.fn(),
    lineBack: vi.fn(),
  }
  let endpoint: VoiceEndpoint | null = null
  const voice = {
    capability: { available: true },
    start: vi.fn((given: VoiceEndpoint) => {
      endpoint = given

      return Promise.resolve(outcome)
    }),
    call: vi.fn((id: string) => (id === 'call1' ? call : null)),
    end: vi.fn(),
  } as unknown as VoicePort
  const desk = new PhoneVoiceDesk({
    voice,
    send: (_deviceId, message) => sent.push(message),
    stream: (_deviceId, body) => streamed.push(body),
    projectKey: () => 'p-home',
    timer: (run, ms) => {
      const entry = { run, ms }

      timers.push(entry)

      return () => timers.splice(timers.indexOf(entry), 1)
    },
  })

  return { desk, sent, streamed, timers, call, voice, endpoint: () => endpoint }
}

const start = { p: 1, k: 'voice', act: 'start', ref: 'r1' } as const
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const mic = { kind: 'mic' as const, epoch: 0, frame: 0, pcm: new Uint8Array(2560) }

describe('PhoneVoiceDesk', () => {
  it('starts a call and answers with it, the project as a phone key', async () => {
    const { desk, sent } = setup()

    desk.message('phone', start)
    await settle()

    expect(sent.at(-1)?.event).toMatchObject({
      kind: 'started',
      ref: 'r1',
      call: { callId: 'call1', conversationId: 'c1', projectKey: 'p-home' },
    })
  })

  it('answers a repeated start with the same call, not busy', async () => {
    const { desk, sent, voice } = setup()

    desk.message('phone', start)
    await settle()
    desk.message('phone', start)
    await settle()

    expect(voice.start).toHaveBeenCalledTimes(1)
    expect(sent.at(-1)?.event).toMatchObject({ kind: 'started', ref: 'r1' })
  })

  it('says why a call was refused', async () => {
    const { desk, sent } = setup({ ok: false, reason: 'noKey' })

    desk.message('phone', start)
    await settle()

    expect(sent.at(-1)?.event).toEqual({ kind: 'refused', ref: 'r1', reason: 'noKey' })
  })

  it('passes the microphone on and the buttons only for its own call', async () => {
    const { desk, call } = setup()

    desk.message('phone', start)
    await settle()
    desk.audio('phone', mic)
    desk.audio('other', mic)
    desk.message('phone', { p: 1, k: 'voice', act: 'mute', callId: 'call1', on: true })
    desk.message('phone', { p: 1, k: 'voice', act: 'stop', callId: 'other' })

    expect(call.mic).toHaveBeenCalledTimes(1)
    expect(call.mute).toHaveBeenCalledWith(true)
    expect(call.stop).not.toHaveBeenCalled()
  })

  it('takes a silent microphone for a lost line, and the next frame for its return', async () => {
    const { desk, call, timers } = setup()

    desk.message('phone', start)
    await settle()
    timers.find((timer) => timer.ms === SILENT_LINE_MS)?.run()
    expect(call.lineLost).toHaveBeenCalled()

    desk.audio('phone', mic)
    expect(call.lineBack).toHaveBeenCalled()
  })

  it('does not count a pause as a lost line', async () => {
    const { desk, call, timers } = setup()

    desk.message('phone', start)
    await settle()
    desk.message('phone', { p: 1, k: 'voice', act: 'pause', callId: 'call1' })

    expect(call.pause).toHaveBeenCalled()
    expect(timers.find((timer) => timer.ms === SILENT_LINE_MS)).toBeUndefined()
  })

  it('remembers to push when the call ends while the agent still works', async () => {
    const { desk, sent, endpoint } = setup()

    desk.message('phone', start)
    await settle()
    endpoint()?.cue({
      kind: 'state',
      call: { ...VIEW, state: 'working', tool: 'Bash', agentBusy: true },
    })
    endpoint()?.cue({ kind: 'ended', reason: 'hangup', conversationId: 'c1' })

    expect(sent.at(-1)?.event).toMatchObject({
      kind: 'ended',
      callId: 'call1',
      projectKey: 'p-home',
    })
    expect(desk.takeFollowUp('c1')).toBe('phone')
    expect(desk.takeFollowUp('c1')).toBeNull()
  })

  it('takes a microphone frame after a pause for the page coming back', async () => {
    const { desk, call } = setup()

    desk.message('phone', start)
    await settle()
    desk.message('phone', { p: 1, k: 'voice', act: 'pause', callId: 'call1' })
    desk.audio('phone', mic)

    expect(call.resume).toHaveBeenCalled()
    expect(call.mic).toHaveBeenCalledTimes(1)
  })

  it('does not promise a push when the agent was idle at hang up', async () => {
    const { desk, endpoint } = setup()

    desk.message('phone', start)
    await settle()
    endpoint()?.cue({ kind: 'state', call: { ...VIEW, state: 'speaking' } })
    endpoint()?.cue({ kind: 'ended', reason: 'hangup', conversationId: 'c1' })

    expect(desk.takeFollowUp('c1')).toBeNull()
  })

  it('sends the answer in 200 ms frames', async () => {
    const { desk, streamed, endpoint } = setup()

    desk.message('phone', start)
    await settle()
    endpoint()?.play(Buffer.alloc(ANSWER_CHUNK_BYTES / 2), 0, 0)
    endpoint()?.play(Buffer.alloc(ANSWER_CHUNK_BYTES / 2), 0, 1)

    expect(streamed).toHaveLength(1)
    expect(decodeAudio(streamed[0] ?? new Uint8Array())).toMatchObject({
      kind: 'answer',
      epoch: 0,
      frame: 0,
    })
  })
})

describe('AnswerChunks', () => {
  it('sends a short tail after a pause and drops what a cut epoch left', () => {
    const sent: Uint8Array[] = []
    const timers: Array<() => void> = []
    const chunks = new AnswerChunks(
      (run) => {
        timers.push(run)

        return () => undefined
      },
      (body) => sent.push(body),
    )

    chunks.push(0, new Uint8Array(100))
    timers.shift()?.()
    expect(sent).toHaveLength(1)

    chunks.push(0, new Uint8Array(100))
    chunks.drop(0)
    timers.shift()?.()
    expect(sent).toHaveLength(1)

    chunks.push(1, new Uint8Array(100))
    timers.shift()?.()
    expect(decodeAudio(sent.at(-1) ?? new Uint8Array())).toMatchObject({ epoch: 1, frame: 0 })
  })
})

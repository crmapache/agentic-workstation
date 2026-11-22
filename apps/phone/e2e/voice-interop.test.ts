import { it, vi, expect, describe, afterEach } from 'vitest'

import type { VoiceEvent } from '@agentic-workstation/remote-protocol/agent-messages'
import type { AudioFrame } from '@agentic-workstation/remote-protocol/audio-frame'
import { encodeAudio } from '@agentic-workstation/remote-protocol/audio-frame'

import type { VoiceCallView } from '../../desktop/src/shared/voice'
import type { VoicePort } from '../../desktop/src/main/remote/bridge/bridge-ports'
import type { VoiceEndpoint } from '../../desktop/src/main/voice/call/voice-endpoint'
import { until } from './ide-harness'
import { lastOf, harness, pairPhone, runCleanups } from './interop-phone'

/**
 * Голосовой звонок (ADR 0104) ядром телефона через настоящий релей к настоящему RemoteService:
 * просьба и ответ словами `voice`, микрофон и ответ - двоичными телами внутри SEALED, сигналы
 * звонка. Звонок за IDE - подставной: Deepgram здесь ни при чём.
 */

afterEach(runCleanups)

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
  startedAt: 0,
}

const fakeVoice = () => {
  const call = { mic: vi.fn(), played: vi.fn(), end: vi.fn(), lineLost: vi.fn(), lineBack: vi.fn() }
  let endpoint: VoiceEndpoint | null = null
  const voice = {
    capability: { available: true },
    start: (given: VoiceEndpoint) => {
      endpoint = given

      return Promise.resolve({ ok: true as const, call: VIEW })
    },
    call: (id: string) => (id === VIEW.id ? call : null),
    end: vi.fn(),
  } as unknown as VoicePort

  return { voice, call, endpoint: () => endpoint }
}

describe('голосовой звонок через настоящий релей', () => {
  it('просьба, микрофон телефона в звонок, ответ и сигналы обратно', async () => {
    const fake = fakeVoice()
    const ide = await harness({ voice: fake.voice })
    const { client, inbox, code } = await pairPhone(ide)
    const agentId = code.agentId
    const events: VoiceEvent[] = []
    const audio: AudioFrame[] = []

    client.events.on('message', (_id, message) => {
      if (message.k === 'voice') events.push(message.event)
    })
    client.events.on('audio', (_id, frame) => audio.push(frame))

    const inventory = await until(() => lastOf(inbox, 'inventory'), 'inventory')

    expect(inventory.voice).toEqual({ available: true })

    await client.send(agentId, { p: 1, k: 'voice', act: 'start', ref: 'r1' })
    const started = await until(
      () => events.find((event) => event.kind === 'started'),
      'the call started',
    )

    expect(started).toMatchObject({ ref: 'r1', call: { callId: 'call1', conversationId: 'c1' } })

    const pcm = new Uint8Array(2560).fill(7)

    await client.sendBody(agentId, encodeAudio({ kind: 'mic', epoch: 0, frame: 0, pcm }))
    await until(() => fake.call.mic.mock.calls.length > 0 || null, 'the microphone at the IDE')
    expect([...(fake.call.mic.mock.calls[0]?.[0] as Uint8Array)]).toEqual([...pcm])

    fake.endpoint()?.play(Buffer.alloc(9600, 3), 0, 0)
    const answer = await until(() => audio[0], 'the answer at the phone')

    expect(answer).toMatchObject({ kind: 'answer', epoch: 0, frame: 0 })
    expect(answer.pcm.byteLength).toBe(9600)

    fake.endpoint()?.cue({ kind: 'stopPlayback', epoch: 1 })
    await until(() => events.find((event) => event.kind === 'stopPlayback'), 'stop playback')

    await client.send(agentId, {
      p: 1,
      k: 'voice',
      act: 'played',
      callId: 'call1',
      epoch: 1,
      ms: 400,
    })
    await until(() => fake.call.played.mock.calls.length > 0 || null, 'played at the IDE')
    expect(fake.call.played).toHaveBeenCalledWith(1, 400)
  })
})

import { it, vi, expect, describe } from 'vitest'

import type { Conversation } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'
import type { VoiceCue, VoiceCallEnd, VoiceOutgoing } from '@shared/voice'
import { DEFAULT_VOICE_SETTINGS } from '@shared/voice'

import type { DeepgramDial, DeepgramHandlers } from '../deepgram/deepgram-link'
import { PLAY_BYTES_PER_MS } from '../deepgram/flux-speak'
import { VoiceCall } from './voice-call'

type Socket = { url: string; handlers: DeepgramHandlers; sent: Array<string | Uint8Array> }

const harness = () => {
  const sockets: Socket[] = []
  const dial: DeepgramDial = (url, _key, handlers) => {
    const socket: Socket = { url, handlers, sent: [] }

    sockets.push(socket)
    queueMicrotask(() => handlers.open())

    return { send: (data) => socket.sent.push(data), close: () => undefined }
  }
  const timers: Array<{ run: () => void; ms: number }> = []
  const cues: VoiceCue[] = []
  const played: Array<{ epoch: number; frame: number }> = []
  const sent: Array<{ text: string; voice: VoiceOutgoing }> = []
  const ended: VoiceCallEnd[] = []
  const interrupt = vi.fn()
  const checkKey = vi.fn(() => Promise.resolve('ok' as const))
  const call = new VoiceCall({
    id: 'call',
    conversationId: 'c1',
    view: { provider: 'claude', origin: 'desktop', startedAt: 0 },
    settings: { ...DEFAULT_VOICE_SETTINGS, enabled: true },
    key: 'k',
    dial,
    timer: (run, ms) => {
      const entry = { run, ms }

      timers.push(entry)

      return () => timers.splice(timers.indexOf(entry), 1)
    },
    endpoint: {
      origin: 'desktop',
      play: (_pcm, epoch, frame) => played.push({ epoch, frame }),
      cue: (cue) => cues.push(cue),
    },
    agent: {
      send: (text, voice) => {
        sent.push({ text, voice })

        return Promise.resolve()
      },
      interrupt,
    },
    checkKey,
    onView: () => undefined,
    onEnded: (reason) => ended.push(reason),
  })

  const listen = () => sockets.filter((socket) => socket.url.includes('/v2/listen')).at(-1)
  const speak = () => sockets.filter((socket) => socket.url.includes('/v2/speak')).at(-1)
  const says = (socket: Socket | undefined) =>
    (socket?.sent ?? [])
      .filter((data) => typeof data === 'string')
      .map((data) => JSON.parse(data) as { type: string; text?: string })
  const turn = (event: string, transcript: string, languages = ['ru']) =>
    listen()?.handlers.text(
      JSON.stringify({
        type: 'TurnInfo',
        event,
        turn_index: 0,
        transcript,
        words: transcript.split(' ').map((word) => ({ word, confidence: 0.95 })),
        languages,
      }),
    )
  const state = (status: Conversation['status'], pending: Conversation['pending'] = null) =>
    call.conversation({ id: 'c1', status, pending } as Conversation)
  const answer = (text: string, streaming: boolean): FeedPatch => ({
    conversationId: 'c1',
    upserts: [{ kind: 'assistant', id: 'a1', parentToolUseId: null, text, streaming }],
  })
  const lastState = () => cues.filter((cue) => cue.kind === 'state').at(-1)

  return {
    call,
    sockets,
    timers,
    cues,
    played,
    sent,
    ended,
    interrupt,
    checkKey,
    listen,
    speak,
    says,
    turn,
    state,
    answer,
    lastState,
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('VoiceCall', () => {
  it('sends a spoken line with its language and speaks the answer back', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.turn('EndOfTurn', 'Посмотри встречи на завтра')
    expect(h.sent).toEqual([
      { text: 'Посмотри встречи на завтра', voice: { lang: 'ru', heard: null } },
    ])

    h.state('running')
    h.call.feed(h.answer('Сейчас посмотрю. Минуту', true))
    expect(h.speak()?.url).toContain('model=flux-olga-ru')
    expect(h.says(h.speak())).toEqual([{ type: 'Speak', text: 'Сейчас посмотрю. ' }])

    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechStarted' }))
    h.speak()?.handlers.audio(Buffer.alloc(PLAY_BYTES_PER_MS * 500))
    expect(h.played).toEqual([{ epoch: 0, frame: 0 }])
    expect(h.lastState()).toMatchObject({ call: { state: 'speaking' } })

    h.call.feed(h.answer('Сейчас посмотрю. Минуту', false))
    h.state('idle')
    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechMetadata' }))
    h.call.played(0, 500)
    expect(h.lastState()).toMatchObject({ call: { state: 'listening' } })
  })

  it('stops the answer when the person talks over it and tells the model what they heard', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.state('running')
    h.call.feed(h.answer('У тебя три встречи. Первая в девять. ', true))
    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechStarted' }))
    h.speak()?.handlers.audio(Buffer.alloc(PLAY_BYTES_PER_MS * 2000))
    h.call.played(0, 800)

    // «Угу» - ещё не перебивание: ответ только приглушается.
    h.turn('StartOfTurn', 'угу')
    expect(h.cues).toContainEqual({ kind: 'duck', level: 0.2 })
    expect(h.says(h.speak()).some((message) => message.type === 'Interrupt')).toBe(false)
    h.turn('Update', 'угу нет подожди')

    expect(h.says(h.speak()).at(-1)).toEqual({
      type: 'Interrupt',
      playback_offset: { type: 'time_ms', value: 800 },
    })
    expect(h.cues).toContainEqual({ kind: 'stopPlayback', epoch: 1 })

    h.speak()?.handlers.text(
      JSON.stringify({
        type: 'SpeechInterrupted',
        audio_played_ms: 800,
        text_spoken: 'У тебя три',
      }),
    )
    h.turn('EndOfTurn', 'угу нет подожди покажи только первую')
    expect(h.interrupt).toHaveBeenCalled()
    expect(h.sent).toEqual([])

    h.state('idle')
    expect(h.sent).toEqual([
      {
        text: 'угу нет подожди покажи только первую',
        voice: { lang: 'ru', heard: 'У тебя три' },
      },
    ])
  })

  it('does not take its own echo for the person cutting in', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.state('running')
    h.call.feed(h.answer('Сейчас посмотрю твой календарь. ', true))
    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechStarted' }))
    h.speak()?.handlers.audio(Buffer.alloc(PLAY_BYTES_PER_MS * 1000))
    h.turn('StartOfTurn', 'твой календарь')
    h.turn('EndOfTurn', 'твой календарь')

    expect(h.says(h.speak()).some((message) => message.type === 'Interrupt')).toBe(false)
    expect(h.sent).toEqual([])
  })

  it('says out loud that the agent needs a permission', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.turn('EndOfTurn', 'Удали старые логи пожалуйста')
    h.state('waiting', {
      kind: 'permission',
      requestId: 'r1',
      description: 'rm -rf logs',
      toolName: 'Bash',
    } as Conversation['pending'])

    expect(h.says(h.speak())[0]?.text).toContain('Нужно разрешение: rm -rf logs.')
  })

  it('closes Deepgram while paused and opens it again on resume', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    const before = h.sockets.length

    h.call.pause()
    expect(h.lastState()).toMatchObject({ call: { state: 'paused' } })
    h.call.mic(new Uint8Array(10))
    h.call.resume()
    await settle()

    expect(h.sockets.length).toBeGreaterThan(before)
    expect(h.lastState()).toMatchObject({ call: { state: 'listening' } })
  })

  it('ends the call with the key rejected when Deepgram will not take it', async () => {
    const h = harness()

    h.checkKey.mockResolvedValueOnce('invalid' as never)
    h.call.start([])
    await settle()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      h.listen()?.handlers.close(1006)
      h.timers.find((timer) => timer.ms <= 4000)?.run()
    }

    await settle()
    expect(h.ended).toEqual(['keyRejected'])
    expect(h.cues.at(-1)).toEqual({ kind: 'ended', reason: 'keyRejected', conversationId: 'c1' })
  })

  it('ends the call after a minute without the line', () => {
    const h = harness()

    h.call.start([])
    h.call.lineLost()
    h.timers.find((timer) => timer.ms === 60_000)?.run()

    expect(h.ended).toEqual(['lostLine'])
  })
})

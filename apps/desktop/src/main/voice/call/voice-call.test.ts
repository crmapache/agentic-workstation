import { it, vi, expect, describe } from 'vitest'

import type { Conversation } from '@shared/conversation'
import type { FeedPatch } from '@shared/conversation-feed'
import type { VoiceCue, VoiceCallEnd, VoiceCallMode, VoiceOutgoing } from '@shared/voice'
import { DEFAULT_VOICE_SETTINGS } from '@shared/voice'

import type { DeepgramDial, DeepgramHandlers } from '../deepgram/deepgram-link'
import { PLAY_BYTES_PER_MS } from '../deepgram/flux-speak'
import type { SpokenAnswer } from './call-mouth'
import { PAUSE_MS } from './utterances'
import type { Utterance } from './utterances'
import { VoiceCall } from './voice-call'

type Socket = { url: string; handlers: DeepgramHandlers; sent: Array<string | Uint8Array> }

const harness = (mode: VoiceCallMode = 'call', intercept?: (utterance: Utterance) => boolean) => {
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
  const notices: Array<{ code: string; detail: string }> = []
  const checkKey = vi.fn(() => Promise.resolve('ok' as const))
  const spoken: SpokenAnswer[] = []
  const call = new VoiceCall({
    id: 'call',
    conversationId: 'c1',
    view: { provider: 'claude', origin: 'desktop', mode, startedAt: 0 },
    settings: { ...DEFAULT_VOICE_SETTINGS, enabled: true },
    key: 'k',
    dial,
    timer: (run, ms) => {
      const entry = { run, ms }

      timers.push(entry)

      return () => timers.splice(timers.indexOf(entry), 1)
    },
    now: () => 0,
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
      notice: (code, detail) => notices.push({ code, detail }),
    },
    checkKey,
    onView: () => undefined,
    onEnded: (reason) => ended.push(reason),
    onSpoken: (answer) => spoken.push(answer),
    intercept,
  })

  const listen = () => sockets.filter((socket) => socket.url.includes('/v2/listen')).at(-1)
  const speak = () => sockets.filter((socket) => socket.url.includes('/v2/speak')).at(-1)
  const speakers = () => sockets.filter((socket) => socket.url.includes('/v2/speak'))
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
  const answer = (text: string, streaming: boolean, id = 'a1'): FeedPatch => ({
    conversationId: 'c1',
    upserts: [{ kind: 'assistant', id, parentToolUseId: null, text, streaming }],
  })
  const lastState = () => cues.filter((cue) => cue.kind === 'state').at(-1)
  /** Человек замолчал дольше паузы: реплика, что её ждала, уходит в чат. */
  const pause = () => timers.find((timer) => timer.ms === PAUSE_MS)?.run()

  return {
    call,
    sockets,
    timers,
    cues,
    played,
    sent,
    spoken,
    speakers,
    ended,
    interrupt,
    notices,
    checkKey,
    listen,
    speak,
    says,
    turn,
    state,
    answer,
    lastState,
    pause,
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('VoiceCall', () => {
  it('sends a spoken line with its language and speaks the answer back', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.turn('EndOfTurn', 'Посмотри встречи на завтра')
    expect(h.sent).toEqual([])
    h.pause()
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

    // «Подожди» останавливает работу сразу, не дожидаясь конца реплики и паузы после неё.
    expect(h.interrupt).toHaveBeenCalled()
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
    h.pause()
    expect(h.sent).toEqual([])

    h.state('idle')
    expect(h.sent).toEqual([
      {
        text: 'угу нет подожди покажи только первую',
        voice: { lang: 'ru', heard: 'У тебя три' },
      },
    ])
    expect(h.notices).toContainEqual({ code: 'voice-heard', detail: 'У тебя три' })
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
    h.pause()
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

  it('works out what was heard when the answer had already arrived whole', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.state('running')
    h.call.feed(h.answer('Раз два три четыре.', false))
    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechStarted' }))
    h.speak()?.handlers.audio(Buffer.alloc(PLAY_BYTES_PER_MS * 2000))
    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechMetadata' }))
    h.call.played(0, 1000)
    h.call.stop()

    expect(h.says(h.speak()).some((message) => message.type === 'Interrupt')).toBe(false)
    expect(h.notices).toContainEqual({ code: 'voice-heard', detail: 'Раз два' })
  })

  it('stops an answer that has no sound yet on Stop', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.state('running')
    h.call.feed(h.answer('Первая фраза. Вторая', true))
    const spoken = h.says(h.speak()).length

    h.call.stop()
    h.call.feed(h.answer('Первая фраза. Вторая фраза.', false))

    expect(h.interrupt).toHaveBeenCalled()
    expect(h.says(h.speak()).filter((message) => message.type === 'Speak')).toHaveLength(spoken)
  })

  it('keeps an answer said during a pause for after it, on a new epoch', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.state('running')
    h.call.feed(h.answer('Первый ответ. ', true))
    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechStarted' }))
    h.speak()?.handlers.audio(Buffer.alloc(PLAY_BYTES_PER_MS * 500))
    h.call.stop()
    h.call.pause()
    const sockets = h.sockets.length

    h.call.feed({
      conversationId: 'c1',
      upserts: [
        {
          kind: 'assistant',
          id: 'a2',
          parentToolUseId: null,
          text: 'Почта пуста.',
          streaming: false,
        },
      ],
    })
    expect(h.sockets).toHaveLength(sockets)

    h.call.resume()
    await settle()

    expect(h.cues).toContainEqual({ kind: 'stopPlayback', epoch: 2 })
    expect(h.says(h.speak())).toContainEqual({ type: 'Speak', text: 'Почта пуста. ' })
  })

  it('ends cleanly when the conversation is gone even if stopping it throws', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.state('running')
    h.interrupt.mockImplementation(() => {
      throw new Error('no conversation')
    })
    h.turn('EndOfTurn', 'подожди')
    h.call.conversation(null)

    expect(h.ended).toEqual(['conversationGone'])
    expect(h.cues.at(-1)).toMatchObject({ kind: 'ended', reason: 'conversationGone' })
  })

  it('ends the call after a minute without the line', () => {
    const h = harness()

    h.call.start([])
    h.call.lineLost()
    h.timers.find((timer) => timer.ms === 60_000)?.run()

    expect(h.ended).toEqual(['lostLine'])
    expect(h.notices).toEqual([
      { code: 'voice-started', detail: 'desktop' },
      { code: 'voice-ended', detail: 'lostLine' },
    ])
  })
})

/** Звонок владельца 2026-11-21: русская реплика с ярлыком pt и русский ответ с цитатой. */
const RUSSIAN_LINE =
  'Ok, a теперь посмотри за последние десять минут в WhatsApp были какие-нибудь сообщения?'
const RUSSIAN_ANSWER =
  'За последние десять минут в WhatsApp была только переписка с Бьянкой. В 22:39 ты написал ей «hmm poquito», а в 22:40 она ответила с улыбкой, что ты заработаешь больше нежности поцелуями, и прислала эмодзи с поцелуем. Больше сообщений не было.'

describe('VoiceCall: the voice of an answer', () => {
  it('speaks a Russian answer with a Spanish quote in the Russian voice after a line Flux called pt', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.turn('EndOfTurn', RUSSIAN_LINE, ['pt'])
    h.pause()
    expect(h.sent.at(-1)?.voice.lang).toBe('ru')

    h.state('running')
    h.call.feed(h.answer(RUSSIAN_ANSWER.slice(0, 120), true))
    h.call.feed(h.answer(RUSSIAN_ANSWER, false))

    const used = h.speakers().filter((socket) => h.says(socket).some((m) => m.type === 'Speak'))

    expect(used.map((socket) => socket.url)).toEqual([expect.stringContaining('flux-olga-ru')])
    expect(h.speakers().some((socket) => socket.url.includes('mariana'))).toBe(false)
  })

  it('follows the language of the answer, not of the line it answers', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.turn('EndOfTurn', 'What came in on WhatsApp in the last ten minutes?', ['en'])
    h.pause()
    h.state('running')
    h.call.feed(h.answer('Только переписка с Бьянкой, больше ничего.', false))

    expect(h.speak()?.url).toContain('flux-olga-ru')
  })

  it('waits for enough words before it picks a voice for a streaming answer', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.state('running')
    h.call.feed(h.answer('Ok. ', true))
    expect(h.speakers().some((socket) => h.says(socket).some((m) => m.type === 'Speak'))).toBe(
      false,
    )

    h.call.feed(h.answer('Ok. The build is green and all the tests pass. ', true))
    await settle()
    expect(h.speak()?.url).toContain('flux-paige-en')
    expect(h.says(h.speak()).filter((m) => m.type === 'Speak')).toEqual([
      { type: 'Speak', text: 'Ok. ' },
      { type: 'Speak', text: 'The build is green and all the tests pass. ' },
    ])
  })
})

describe('VoiceCall: Stop and the kept answer', () => {
  it('starts a new epoch on Stop even when nothing is left to say', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.call.stop()

    expect(h.cues).toContainEqual({ kind: 'stopPlayback', epoch: 1 })
    expect(h.interrupt).not.toHaveBeenCalled()
  })

  it('keeps the sound of an answer said in full, and not of a cut one', async () => {
    const h = harness()

    h.call.start([])
    await settle()
    h.state('running')
    h.call.feed(h.answer('Почта пуста. Новых писем нет.', false))
    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechStarted' }))
    h.speak()?.handlers.audio(Buffer.alloc(PLAY_BYTES_PER_MS * 300))
    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechMetadata' }))

    expect(h.spoken).toHaveLength(1)
    expect(h.spoken[0]).toMatchObject({
      language: 'ru',
      voice: 'flux-olga-ru',
      speed: 1,
      text: 'Почта пуста. Новых писем нет.',
    })
    expect(h.spoken[0]?.pcm.byteLength).toBe(PLAY_BYTES_PER_MS * 300)

    h.call.feed(h.answer('Первая фраза. Вторая фраза.', false, 'a2'))
    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechStarted' }))
    h.speak()?.handlers.audio(Buffer.alloc(PLAY_BYTES_PER_MS * 300))
    h.call.stop()
    h.speak()?.handlers.text(JSON.stringify({ type: 'SpeechMetadata' }))

    expect(h.spoken).toHaveLength(1)
  })
})

describe('VoiceCall in a walkthrough (ADR 0134)', () => {
  const tool = (status: 'running' | 'done', id = 't1'): FeedPatch => ({
    conversationId: 'c1',
    upserts: [
      {
        kind: 'tool',
        id,
        parentToolUseId: null,
        name: 'mcp__walkthrough__circle',
        status,
      } as FeedPatch['upserts'][number],
    ],
  })

  it('asks what to show first and sends lines marked as a walkthrough', async () => {
    const h = harness('walkthrough')

    h.call.start([])
    await settle()

    expect(h.speak()?.url).toContain('model=flux-olga-ru')
    expect(h.says(h.speak())).toContainEqual({
      type: 'Speak',
      text: 'Что показать или объяснить? ',
    })

    h.turn('EndOfTurn', 'Покажи, что ты сделал')
    h.pause()
    expect(h.sent).toEqual([
      { text: 'Покажи, что ты сделал', voice: { lang: 'ru', heard: null, walkthrough: true } },
    ])
  })

  it('answers when the words said before a tool call have been heard, not the ones after', async () => {
    const h = harness('walkthrough')

    h.call.start([])
    await settle()
    h.state('running')
    h.call.feed(h.answer('Это кнопка Deploy. ', false, 'a1'))
    h.call.feed(tool('running'))

    const { spoken } = await h.call.speechSoFar()
    let heard: boolean | null = null

    void spoken.then((value) => {
      heard = value
    })

    // Модель уже пишет следующую фразу - её такт этой метки не ждёт.
    h.call.feed(h.answer('Она публикует проект. ', true, 'a2'))
    const [greeting] = h.speakers()

    greeting?.handlers.text(JSON.stringify({ type: 'SpeechStarted' }))
    greeting?.handlers.audio(Buffer.alloc(PLAY_BYTES_PER_MS * 300))
    greeting?.handlers.text(JSON.stringify({ type: 'SpeechMetadata' }))
    greeting?.handlers.text(JSON.stringify({ type: 'SpeechStarted' }))
    greeting?.handlers.audio(Buffer.alloc(PLAY_BYTES_PER_MS * 400))
    greeting?.handlers.text(JSON.stringify({ type: 'SpeechMetadata' }))
    await settle()
    expect(heard).toBeNull()

    h.call.played(0, 700)
    await settle()
    expect(heard).toBe(true)
  })

  it('reports cut words when the person talks over them', async () => {
    const h = harness('walkthrough')

    h.call.start([])
    await settle()
    h.state('running')
    h.call.feed(h.answer('Сейчас нажму Settings. ', false, 'a1'))
    h.call.feed(tool('running'))

    const { spoken } = await h.call.speechSoFar()

    h.call.stop()

    await expect(spoken).resolves.toBe(false)
  })

  it('does not wait for the feed forever when the tool call is not shown in it', async () => {
    const h = harness('walkthrough')

    h.call.start([])
    await settle()

    const pending = h.call.speechSoFar()

    h.timers.find((timer) => timer.ms === 400)?.run()

    await expect(pending).resolves.toHaveProperty('spoken')
  })

  it('gives a line to a walkthrough that waits for the person instead of the chat', async () => {
    const taken: string[] = []
    const h = harness('walkthrough', (utterance) => {
      taken.push(utterance.text)

      return true
    })

    h.call.start([])
    await settle()
    h.turn('EndOfTurn', 'Готово, нажал')
    h.pause()

    expect(taken).toEqual(['Готово, нажал'])
    expect(h.sent).toEqual([])
  })
})

import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach } from 'vitest'

import type { VoiceSettings } from '@shared/voice'
import { DEFAULT_VOICE_SETTINGS } from '@shared/voice'
import type { VoiceReadingEnd } from '@shared/voice-reading'

import { VoiceSamples } from '../voice-samples'
import type { DeepgramDial, DeepgramHandlers } from '../deepgram/deepgram-link'
import { PACE_SLICE_BYTES } from './reading'
import { VoiceReader, READ_MAX_CHARS, readableSentences } from './voice-reader'

type Socket = { url: string; handlers: DeepgramHandlers; sent: string[] }

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Запись на диск идёт после конца чтения - ждать её, а не угадывать число тактов. */
const until = async <T>(probe: () => Promise<T | null>): Promise<T | null> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await probe()

    if (value) return value

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  return null
}

const harness = async (settings: Partial<VoiceSettings> = {}, key: string | null = 'k') => {
  const dir = await mkdtemp(join(tmpdir(), 'aw-voice-reader-'))

  dirs.push(dir)

  const sockets: Socket[] = []
  const dial: DeepgramDial = (url, _key, handlers) => {
    const socket: Socket = { url, handlers, sent: [] }

    sockets.push(socket)
    queueMicrotask(() => handlers.open())

    return {
      send: (data) => {
        if (typeof data === 'string') socket.sent.push(data)
      },
      close: () => undefined,
    }
  }
  const timers: Array<{ run: () => void; ms: number }> = []
  const cache = new VoiceSamples(dir)
  const reader = new VoiceReader({
    store: { key, settings: { ...DEFAULT_VOICE_SETTINGS, enabled: true, ...settings } },
    cache,
    dial,
    timer: (run, ms) => {
      const entry = { run, ms }

      timers.push(entry)

      return () => timers.splice(timers.indexOf(entry), 1)
    },
  })
  const sink = () => {
    const audio: Uint8Array[] = []
    const ends: VoiceReadingEnd[] = []

    return {
      audio,
      ends,
      sink: {
        audio: (pcm: Uint8Array) => audio.push(pcm),
        end: (outcome: VoiceReadingEnd) => ends.push(outcome),
      },
    }
  }

  return { reader, cache, sockets, timers, sink }
}

const says = (socket: Socket | undefined) =>
  (socket?.sent ?? []).map((data) => JSON.parse(data) as { type: string; text?: string })

describe('VoiceReader', () => {
  it('reads a Russian answer with a Spanish quote in the Russian voice and keeps the sound', async () => {
    const h = await harness()
    const out = h.sink()
    const text =
      'В 22:39 ты написал ей «hmm poquito», а в 22:40 она ответила с улыбкой. Больше сообщений не было.'

    expect(h.reader.read({ id: 'r1', owner: 'desktop', text, sink: out.sink })).toBeNull()
    await settle()
    await settle()

    const socket = h.sockets[0]

    expect(socket?.url).toContain('model=flux-olga-ru')
    expect(says(socket).map((message) => message.type)).toEqual(['Speak', 'Speak', 'Flush'])

    socket?.handlers.audio(Buffer.alloc(4800, 1))
    socket?.handlers.text(JSON.stringify({ type: 'SpeechMetadata' }))
    await settle()

    expect(out.audio.map((pcm) => pcm.byteLength)).toEqual([4800])
    expect(out.ends).toEqual(['done'])

    const kept = await until(() =>
      h.cache.peek({
        language: 'ru',
        voice: 'flux-olga-ru',
        speed: 1,
        text: readableSentences(text).join(' '),
      }),
    )

    expect(kept?.byteLength).toBe(4800)
  })

  it('plays a kept reading from disk without Deepgram, paced in half-second slices', async () => {
    const h = await harness()
    const text = 'Почта пуста. Новых писем нет.'

    await h.cache.keep(
      { language: 'ru', voice: 'flux-olga-ru', speed: 1, text },
      new Uint8Array(PACE_SLICE_BYTES * 5 + 100),
    )

    const out = h.sink()

    h.reader.read({ id: 'r1', owner: 'desktop', text, sink: out.sink })
    await settle()
    await settle()

    expect(h.sockets).toEqual([])
    expect(out.audio).toHaveLength(4)
    expect(out.ends).toEqual([])

    h.timers.shift()?.run()
    h.timers.shift()?.run()

    expect(out.audio.map((pcm) => pcm.byteLength).slice(4)).toEqual([PACE_SLICE_BYTES, 100])
    expect(out.ends).toEqual(['done'])
  })

  it('takes the sound of an answer the call said in full', async () => {
    const h = await harness()
    const text = 'Почта пуста.'

    h.reader.keep({
      language: 'ru',
      voice: 'flux-olga-ru',
      speed: 1,
      text,
      pcm: new Uint8Array(2000),
    })
    await until(() => h.cache.peek({ language: 'ru', voice: 'flux-olga-ru', speed: 1, text }))

    const out = h.sink()

    h.reader.read({ id: 'r1', owner: 'desktop', text, sink: out.sink })
    await settle()
    await settle()

    expect(h.sockets).toEqual([])
    expect(out.ends).toEqual(['done'])
  })

  it('stops the reading before when the same window starts another, and keeps a broken one off disk', async () => {
    const h = await harness()
    const first = h.sink()
    const second = h.sink()

    h.reader.read({ id: 'r1', owner: 'desktop', text: 'Первый ответ.', sink: first.sink })
    await settle()
    await settle()
    h.reader.read({ id: 'r2', owner: 'desktop', text: 'Второй ответ.', sink: second.sink })
    await settle()
    await settle()

    h.sockets[0]?.handlers.audio(Buffer.alloc(100))
    expect(first.audio).toEqual([])
    expect(first.ends).toEqual(['stopped'])

    h.sockets[1]?.handlers.audio(Buffer.alloc(100))
    h.sockets[1]?.handlers.close(1006)
    await settle()

    expect(second.ends).toEqual(['failed'])
    expect(
      await h.cache.peek({
        language: 'ru',
        voice: 'flux-olga-ru',
        speed: 1,
        text: 'Второй ответ.',
      }),
    ).toBeNull()
  })

  it('stops only its own reading: a late stop of an old press does not touch the new one', async () => {
    const h = await harness()
    const out = h.sink()

    h.reader.read({ id: 'r2', owner: 'phone:p', text: 'Ответ.', sink: out.sink })
    await settle()
    await settle()
    h.reader.stop('phone:p', 'r1')
    h.sockets[0]?.handlers.audio(Buffer.alloc(100))

    expect(out.audio).toHaveLength(1)
  })

  it('refuses without a key and when there is nothing to say', async () => {
    const noKey = await harness({}, null)

    expect(
      noKey.reader.read({ id: 'r', owner: 'd', text: 'Ответ.', sink: noKey.sink().sink }),
    ).toBe('noKey')

    const h = await harness()

    expect(h.reader.read({ id: 'r', owner: 'd', text: '```\nls\n```', sink: h.sink().sink })).toBe(
      'empty',
    )
  })

  it('reads at the speed from the settings and stops a very long answer at its limit', async () => {
    const h = await harness({ speed: 1.2 })

    h.reader.read({ id: 'r', owner: 'd', text: 'The build is green.', sink: h.sink().sink })
    await settle()

    expect(h.sockets[0]?.url).toContain('model=flux-paige-en')
    expect(h.sockets[0]?.url).toContain('speed=1.20')

    const long = Array.from(
      { length: 400 },
      (_, index) => `Это длинная фраза номер ${index} для проверки предела.`,
    ).join(' ')
    const sentences = readableSentences(long)

    expect(sentences.join(' ').length).toBeLessThanOrEqual(READ_MAX_CHARS)
    expect(sentences.length).toBeLessThan(400)
  })
})

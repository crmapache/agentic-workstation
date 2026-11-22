import { describe, expect, it, vi } from 'vitest'

import type { DeepgramDial, DeepgramHandlers } from './deepgram-link'
import { checkDeepgramKey } from './deepgram-link'
import type { ListenTrouble } from './flux-listen'
import { FluxListen, listenUrl } from './flux-listen'
import type { SpeakEvent } from './flux-speak'
import { FluxSpeak, PLAY_BYTES_PER_MS, speakUrl } from './flux-speak'
import type { FluxTurn } from './flux-turn'

type Socket = { url: string; handlers: DeepgramHandlers; sent: Array<string | Uint8Array> }

const fakeDial = () => {
  const sockets: Socket[] = []
  const dial: DeepgramDial = (url, _key, handlers) => {
    const socket: Socket = { url, handlers, sent: [] }

    sockets.push(socket)

    return { send: (data) => socket.sent.push(data), close: () => undefined }
  }

  return { sockets, dial }
}

const fakeTimer = () => {
  const runs: Array<{ run: () => void; ms: number }> = []

  return {
    runs,
    timer: (run: () => void, ms: number) => {
      const entry = { run, ms }

      runs.push(entry)

      return () => runs.splice(runs.indexOf(entry), 1)
    },
  }
}

const json = (sent: Array<string | Uint8Array>) =>
  sent.filter((data) => typeof data === 'string').map((data) => JSON.parse(data) as unknown)

describe('FluxListen', () => {
  const setup = () => {
    const { sockets, dial } = fakeDial()
    const { runs, timer } = fakeTimer()
    const turns: FluxTurn[] = []
    const troubles: ListenTrouble[] = []
    const listen = new FluxListen({
      key: 'k',
      region: 'global',
      mode: 'multi',
      hints: ['ru', 'en'],
      dial,
      timer,
      onTurn: (turn) => turns.push(turn),
      onTrouble: (trouble) => troubles.push(trouble),
    })

    listen.start()

    return { listen, sockets, runs, turns, troubles }
  }

  it('asks for flux multi with the expected languages as hints', () => {
    expect(listenUrl('eu', 'multi', ['ru', 'es'])).toBe(
      'wss://api.eu.deepgram.com/v2/listen?model=flux-general-multi&encoding=linear16&sample_rate=16000&language_hint=ru&language_hint=es',
    )
    expect(listenUrl('global', 'pt', ['ru'])).toContain('language_hint=pt')
    expect(listenUrl('global', 'pt', ['ru'])).not.toContain('language_hint=ru')
  })

  it('keeps the microphone while connecting and sends it once open', () => {
    const { listen, sockets } = setup()
    const frame = new Uint8Array(2560)

    listen.send(frame)
    sockets[0]?.handlers.open()

    expect(sockets[0]?.sent).toEqual([frame])
  })

  it('passes turns on', () => {
    const { sockets, turns } = setup()

    sockets[0]?.handlers.open()
    sockets[0]?.handlers.text(
      JSON.stringify({
        type: 'TurnInfo',
        event: 'EndOfTurn',
        turn_index: 2,
        transcript: 'Привет',
        words: [{ word: 'Привет', confidence: 0.9 }],
        languages: ['ru'],
      }),
    )

    expect(turns).toEqual([
      {
        event: 'EndOfTurn',
        turnIndex: 2,
        transcript: 'Привет',
        words: [{ word: 'Привет', confidence: 0.9 }],
        languages: ['ru'],
      },
    ])
  })

  it('reconnects with growing pauses and gives up after the fourth', () => {
    const { sockets, runs, troubles } = setup()

    sockets[0]?.handlers.open()
    sockets[0]?.handlers.close(1006)
    expect(troubles).toEqual(['reconnecting'])
    expect(runs.map((entry) => entry.ms)).toEqual([500])

    for (const wait of [1000, 2000, 4000]) {
      runs.shift()?.run()
      sockets.at(-1)?.handlers.close(1006)
      expect(runs.at(-1)?.ms).toBe(wait)
    }

    runs.shift()?.run()
    sockets.at(-1)?.handlers.close(1006)
    expect(troubles).toEqual(['reconnecting', 'failed'])
  })

  it('says the line is back after a reconnect', () => {
    const { sockets, runs, troubles } = setup()

    sockets[0]?.handlers.open()
    sockets[0]?.handlers.close(1006)
    runs.shift()?.run()
    sockets[1]?.handlers.open()

    expect(troubles).toEqual(['reconnecting', 'restored'])
  })

  it('closes the stream politely and does not reconnect after stop', () => {
    const { listen, sockets, runs } = setup()

    sockets[0]?.handlers.open()
    listen.stop()
    sockets[0]?.handlers.close(1000)

    expect(json(sockets[0]?.sent ?? [])).toEqual([{ type: 'CloseStream' }])
    expect(runs).toEqual([])
  })
})

describe('FluxSpeak', () => {
  const setup = () => {
    const { sockets, dial } = fakeDial()
    const { timer } = fakeTimer()
    const events: SpeakEvent[] = []
    const speak = new FluxSpeak({
      key: 'k',
      region: 'global',
      voice: 'flux-olga-ru',
      speed: 1,
      dial,
      timer,
      onEvent: (event) => events.push(event),
    })

    return { speak, sockets, events }
  }

  it('asks for linear16 at the playback rate and the speed when not 1', () => {
    expect(speakUrl('global', 'flux-olga-ru', 1)).toBe(
      'wss://api.deepgram.com/v2/speak?model=flux-olga-ru&encoding=linear16&sample_rate=24000',
    )
    expect(speakUrl('global', 'flux-olga-ru', 1.2)).toContain('speed=1.20')
  })

  it('sends sentences as one turn and flushes at the end of the answer', () => {
    const { speak, sockets } = setup()

    speak.say('Сейчас посмотрю.')
    speak.say('Минуту.')
    speak.finish()
    sockets[0]?.handlers.open()

    expect(json(sockets[0]?.sent ?? [])).toEqual([
      { type: 'Speak', text: 'Сейчас посмотрю. ' },
      { type: 'Speak', text: 'Минуту. ' },
      { type: 'Flush' },
    ])
  })

  it('interrupts at the place in the session and drops audio until Deepgram confirms', () => {
    const { speak, sockets, events } = setup()
    const second = Buffer.alloc(PLAY_BYTES_PER_MS * 1000)

    speak.say('Первый ответ.')
    speak.finish()
    sockets[0]?.handlers.open()
    sockets[0]?.handlers.text(JSON.stringify({ type: 'SpeechStarted', speech_id: 'a' }))
    sockets[0]?.handlers.audio(second)
    sockets[0]?.handlers.text(JSON.stringify({ type: 'SpeechMetadata', speech_id: 'a' }))
    speak.say('Второй ответ.')
    sockets[0]?.handlers.text(JSON.stringify({ type: 'SpeechStarted', speech_id: 'b' }))
    expect(speak.position).toBe(1000)
    sockets[0]?.handlers.audio(second)
    speak.interrupt(1400)
    sockets[0]?.handlers.audio(second)
    sockets[0]?.handlers.text(
      JSON.stringify({
        type: 'SpeechInterrupted',
        audio_played_ms: 1400,
        text_spoken: 'Второй',
        text_remaining: 'ответ.',
      }),
    )

    expect(json(sockets[0]?.sent ?? []).at(-1)).toEqual({
      type: 'Interrupt',
      playback_offset: { type: 'time_ms', value: 1400 },
    })
    expect(events.filter((event) => event.kind === 'audio')).toHaveLength(2)
    expect(events.at(-1)).toEqual({ kind: 'interrupted', spoken: 'Второй', remaining: 'ответ.' })
  })

  it('starts over when Deepgram skips an interrupt before any audio', () => {
    const { speak, sockets, events } = setup()

    speak.say('Ответ.')
    sockets[0]?.handlers.open()
    speak.interrupt(0)
    sockets[0]?.handlers.text(JSON.stringify({ type: 'Warning', code: 'NO_AUDIO_GENERATED' }))
    speak.say('Новый.')

    expect(events.at(-1)).toEqual({ kind: 'interrupted', spoken: '', remaining: '' })
    expect(sockets).toHaveLength(2)
  })

  it('does not leave the call waiting when the line drops mid answer', () => {
    const { speak, sockets, events } = setup()

    speak.say('Ответ.')
    sockets[0]?.handlers.open()
    sockets[0]?.handlers.close(1006)

    expect(events).toEqual([{ kind: 'done' }])
  })
})

describe('checkDeepgramKey', () => {
  it('tells a good key from a rejected one and from no answer', async () => {
    const answer = (status: number) =>
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }))

    expect(await checkDeepgramKey('k', 'global', answer(200))).toBe('ok')
    expect(await checkDeepgramKey('k', 'global', answer(401))).toBe('invalid')
    expect(await checkDeepgramKey('k', 'global', answer(503))).toBe('unreachable')
    expect(
      await checkDeepgramKey('k', 'eu', vi.fn<typeof fetch>().mockRejectedValue(new Error('x'))),
    ).toBe('unreachable')
  })
})

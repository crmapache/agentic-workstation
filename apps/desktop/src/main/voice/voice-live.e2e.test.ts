import { it, expect, describe } from 'vitest'

import type { Conversation } from '@shared/conversation'
import type { VoiceCue, VoiceOutgoing } from '@shared/voice'
import { VOICE_PLAY_RATE, DEFAULT_VOICE_SETTINGS } from '@shared/voice'

import { previewVoice } from './voice-preview'
import { realTimer } from './voice-service'
import { PAUSE_MS } from './call/utterances'
import { VoiceCall } from './call/voice-call'
import { dialDeepgram } from './deepgram/deepgram-link'

/**
 * Звонок на настоящем Deepgram (ADR 0104): речь Flux TTS идёт в звонок микрофоном, звонок
 * распознаёт её, шлёт в разговор, озвучивает ответ и обрывает его, когда человек перебивает.
 * Запуск: AGENTIC_WORKSTATION_VOICE_E2E=1 и DEEPGRAM_API_KEY в окружении (платно, копейки).
 */
const KEY = process.env['DEEPGRAM_API_KEY'] ?? ''
const LIVE = process.env['AGENTIC_WORKSTATION_VOICE_E2E'] === '1' && KEY !== ''

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 24 кГц в 16 кГц: два отсчёта из трёх, усреднением - распознаванию хватает. */
const toMicRate = (pcm: Uint8Array): Uint8Array => {
  const input = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const output = new Int16Array(Math.floor((input.length * 2) / 3))

  for (let index = 0; index < output.length; index += 1) {
    const at = (index * 3) / 2
    const left = input[Math.floor(at)] ?? 0
    const right = input[Math.min(input.length - 1, Math.ceil(at))] ?? 0

    output[index] = Math.round((left + right) / 2)
  }

  return new Uint8Array(output.buffer)
}

const speech = async (text: string): Promise<Uint8Array> => {
  const pcm = await previewVoiceText(text)

  if (!pcm) throw new Error('Deepgram did not synthesize the line')

  return toMicRate(pcm)
}

/** Образец голоса с нашим текстом: тот же путь, что у «Прослушать». */
const previewVoiceText = (text: string) =>
  previewVoice({
    key: KEY,
    region: 'global',
    language: 'ru',
    voice: 'flux-olga-ru',
    speed: 1,
    dial: dialDeepgram,
    timer: realTimer,
    text,
  })

/** Тишина после фразы: пауза, после которой реплика уходит в чат, и запас на путь до Deepgram. */
const SILENCE_MS = PAUSE_MS + 1500

/** Микрофон в реальном времени кадрами по 80 мс, с тишиной после. */
const talk = async (call: VoiceCall, pcm: Uint8Array, silenceMs = SILENCE_MS) => {
  const silence = new Uint8Array(Math.round((16000 * 2 * silenceMs) / 1000))
  const all = new Uint8Array(pcm.byteLength + silence.byteLength)

  all.set(pcm)

  for (let at = 0; at < all.byteLength; at += 2560) {
    call.mic(all.subarray(at, at + 2560))
    await sleep(80)
  }
}

/** Звонок на живом Deepgram: что ушло в разговор, сигналы конечной точки, сколько звука сыграно. */
const liveCall = () => {
  const sent: Array<{ text: string; voice: VoiceOutgoing }> = []
  const cues: VoiceCue[] = []
  const heard = { audioMs: 0, turnEnds: 0 }
  const call = new VoiceCall({
    id: 'live',
    conversationId: 'c1',
    view: { provider: 'claude', origin: 'desktop', startedAt: Date.now() },
    settings: { ...DEFAULT_VOICE_SETTINGS, enabled: true },
    key: KEY,
    // Концы ходов Flux считаются, чтобы видеть, что фразу он правда разрезал.
    dial: (url, key, handlers) =>
      dialDeepgram(url, key, {
        ...handlers,
        text: (data) => {
          if (data.includes('"EndOfTurn"')) heard.turnEnds += 1
          handlers.text(data)
        },
      }),
    timer: realTimer,
    now: Date.now,
    endpoint: {
      origin: 'desktop',
      play: (pcm) => {
        heard.audioMs += (pcm.byteLength / 2 / VOICE_PLAY_RATE) * 1000
      },
      cue: (cue) => cues.push(cue),
    },
    agent: {
      send: (text, voice) => {
        sent.push({ text, voice })

        return Promise.resolve()
      },
      interrupt: () => undefined,
      notice: () => undefined,
    },
    checkKey: () => Promise.resolve('ok'),
    onView: () => undefined,
    onEnded: () => undefined,
  })

  return { call, sent, cues, heard }
}

describe.runIf(LIVE)('voice call on live Deepgram', () => {
  it(
    'hears a line, speaks the answer and stops when talked over',
    { timeout: 90_000 },
    async () => {
      const { call, sent, cues, heard } = liveCall()

      call.start([])
      await sleep(1500)
      await talk(call, await speech('Посмотри, пожалуйста, какие встречи у меня завтра.'))

      expect(sent.at(-1)?.voice.lang).toBe('ru')
      expect(sent.at(-1)?.text.toLowerCase()).toContain('встречи')

      call.conversation({ id: 'c1', status: 'running', pending: null } as Conversation)
      call.feed({
        conversationId: 'c1',
        upserts: [
          {
            kind: 'assistant',
            id: 'a1',
            parentToolUseId: null,
            text: 'Завтра у тебя три встречи. Первая в девять утра с командой дизайна, вторая в полдень с заказчиком, третья вечером в шесть, это созвон по планированию на следующую неделю.',
            streaming: false,
          },
        ],
      })
      await sleep(2500)
      expect(heard.audioMs).toBeGreaterThan(1000)

      // Человек «слушает» полторы секунды ответа и перебивает.
      call.played(0, 1500)
      await talk(call, await speech('Стоп, подожди, покажи только первую.'))

      expect(cues).toContainEqual({ kind: 'stopPlayback', epoch: 1 })

      call.conversation({ id: 'c1', status: 'idle', pending: null } as Conversation)
      await sleep(500)
      expect(sent.at(-1)?.text.toLowerCase()).toContain('первую')
      expect(sent.at(-1)?.voice.heard).toBeTruthy()

      call.end('hangup')
    },
  )

  it(
    'keeps a phrase with a short pause in the middle as one line (owner call 2026-11-22)',
    { timeout: 60_000 },
    async () => {
      const { call, sent, heard } = liveCall()
      const start = await speech('Найди эту точку на карте.')
      const rest = await speech('И построй до неё маршрут в Google Картах.')

      call.start([])
      await sleep(1500)
      await talk(call, start, 1200)
      await talk(call, rest)

      expect(heard.turnEnds).toBeGreaterThanOrEqual(2)
      expect(sent).toHaveLength(1)
      expect(sent[0]?.text.toLowerCase()).toContain('точку')
      expect(sent[0]?.text.toLowerCase()).toContain('маршрут')

      call.end('hangup')
    },
  )
})

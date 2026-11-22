import type { VoiceRegion } from '@shared/voice'
import type { VoiceReadingEnd } from '@shared/voice-reading'

import type { VoiceSamples, SampleRequest } from '../voice-samples'
import type { Timer } from '../call/utterances'
import type { DeepgramDial } from '../deepgram/deepgram-link'
import { streamSpeech } from '../deepgram/speech-stream'

/** Куда идёт звук чтения: окно IDE (каналы IPC) или телефон (кадры через релей). */
export type ReadingSink = {
  /** Кусок звука, PCM16 моно 24 кГц, по порядку. */
  audio: (pcm: Uint8Array) => void
  /** Звука больше не будет: дочитано, синтез сорвался или чтение остановили. Один раз. */
  end: (outcome: VoiceReadingEnd) => void
}

/** Готовый звук уходит кусками по полсекунды (24 кГц PCM16): кадр телефона их вмещает. */
export const PACE_SLICE_BYTES = 24_000
/** Столько кусков - сразу: две секунды запаса, сеть не обрывает речь. */
const PACE_AHEAD = 4
/** Дальше - кусок каждые 250 мс, вдвое быстрее речи: стоп не гонит по сети лишние минуты звука. */
const PACE_EVERY_MS = 250

export type ReadingOptions = {
  /** Что читается и каким голосом: ключ звука на диске. */
  sample: SampleRequest
  sentences: readonly string[]
  sink: ReadingSink
  cache: Pick<VoiceSamples, 'peek' | 'keep'>
  key: string
  region: VoiceRegion
  dial: DeepgramDial
  timer: Timer
  /** Чтение кончилось или его остановили: читающему - забыть его. */
  onFinished: () => void
}

/**
 * Одно чтение вслух (ADR 0106): звук с диска, если этот текст этим голосом уже звучал за месяц
 * (в чтении или в звонке), иначе - синтез, который играет по кускам, пока идёт, и ложится на
 * диск целиком, когда дошёл до конца. Оборванный синтез на диск не идёт: половина ответа под
 * его ключом звучала бы как весь.
 */
export class Reading {
  private stopped = false
  private cancel: (() => void) | null = null

  constructor(private readonly options: ReadingOptions) {}

  start(): void {
    void this.run()
  }

  /**
   * Остановили (человек, новое чтение, звонок): звук больше не идёт, синтез закрыт. Конечной
   * точке - stopped: остановила не она сама - ей надо погасить кнопку.
   */
  stop(): void {
    if (this.stopped) return

    this.stopped = true
    this.cancel?.()
    this.cancel = null
    this.options.sink.end('stopped')
    this.options.onFinished()
  }

  private async run(): Promise<void> {
    const kept = await this.options.cache.peek(this.options.sample).catch(() => null)

    if (this.stopped) return
    if (kept) this.pace(kept, 0)
    else this.synthesize()
  }

  /** Звук с диска - кусками: сразу запас, дальше вдвое быстрее речи. */
  private pace(pcm: Uint8Array, from: number): void {
    let at = from

    for (let slice = 0; slice < (from === 0 ? PACE_AHEAD : 1) && at < pcm.byteLength; slice += 1) {
      this.options.sink.audio(pcm.subarray(at, at + PACE_SLICE_BYTES))
      at += PACE_SLICE_BYTES
    }

    if (at >= pcm.byteLength) return this.finish('done')

    this.cancel = this.options.timer(() => {
      this.cancel = null
      if (!this.stopped) this.pace(pcm, at)
    }, PACE_EVERY_MS)
  }

  private synthesize(): void {
    const { sample, sentences, key, region, dial, timer, cache } = this.options
    const chunks: Buffer[] = []

    this.cancel = streamSpeech({
      key,
      region,
      voice: sample.voice,
      speed: sample.speed,
      sentences,
      dial,
      timer,
      onAudio: (pcm) => {
        chunks.push(pcm)
        this.options.sink.audio(new Uint8Array(pcm))
      },
      onEnd: (complete) => {
        this.cancel = null
        if (complete && chunks.length > 0) void cache.keep(sample, Buffer.concat(chunks))
        this.finish(complete && chunks.length > 0 ? 'done' : 'failed')
      },
    })
  }

  private finish(outcome: VoiceReadingEnd): void {
    if (this.stopped) return

    this.stopped = true
    this.options.sink.end(outcome)
    this.options.onFinished()
  }
}

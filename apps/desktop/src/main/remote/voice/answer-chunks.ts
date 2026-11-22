import type { AudioFrame } from '@agentic-workstation/remote-protocol/audio-frame'
import { encodeAudio, MAX_AUDIO_BYTES } from '@agentic-workstation/remote-protocol/audio-frame'

import type { Timer } from '../../voice/call/utterances'

/** Ответ копится до стольких байт (200 мс PCM16 24 кГц), прежде чем уйти кадром. */
export const ANSWER_CHUNK_BYTES = 9600
/** Звука в кадре не больше этого: заголовок кадра - 8 байт сверх него. */
const FRAME_PCM_MAX = MAX_AUDIO_BYTES - 8
/** Неполный кусок уходит через столько, если следом ничего не пришло: конец фразы не ждёт. */
export const ANSWER_FLUSH_MS = 40

/**
 * Ответ звонка телефону кадрами по 200 мс: Flux TTS отдаёт звук кусками по ~50 мс и быстрее
 * реального времени, а у релея предел кадров в минуту на всю линию IDE. Кадры одной эпохи
 * нумеруются подряд; перебили (drop) - недосланное этой эпохи выбрасывается. Тем же путём идёт
 * чтение вслух (kind reading, ADR 0106): эпоха - номер чтения телефона.
 */
export class AnswerChunks {
  private epoch = 0
  private frame = 0
  private chunks: Uint8Array[] = []
  private bytes = 0
  private cancel: (() => void) | null = null

  constructor(
    private readonly timer: Timer,
    private readonly send: (body: Uint8Array) => void,
    private readonly kind: Extract<AudioFrame['kind'], 'answer' | 'reading'> = 'answer',
  ) {}

  push(epoch: number, pcm: Uint8Array): void {
    if (epoch !== this.epoch) {
      this.flush()
      this.epoch = epoch
      this.frame = 0
    }

    // Крупный кусок (готовое чтение с диска) поверх накопленного не влез бы в кадр.
    if (this.bytes + pcm.byteLength > FRAME_PCM_MAX) this.flush()

    this.chunks.push(pcm)
    this.bytes += pcm.byteLength

    if (this.bytes >= ANSWER_CHUNK_BYTES) return this.flush()

    this.cancel ??= this.timer(() => {
      this.cancel = null
      this.flush()
    }, ANSWER_FLUSH_MS)
  }

  /** Перебили: всё, что не ушло, - до эпохи upTo включительно - больше не нужно. */
  drop(upTo: number): void {
    if (this.epoch > upTo) return

    this.cancel?.()
    this.cancel = null
    this.chunks = []
    this.bytes = 0
  }

  /** Отправить накопленное сейчас: звук кончился, слово о конце должно уйти после него. */
  flush(): void {
    this.cancel?.()
    this.cancel = null

    if (this.bytes === 0) return

    const pcm = new Uint8Array(this.bytes)
    let at = 0

    for (const chunk of this.chunks) {
      pcm.set(chunk, at)
      at += chunk.byteLength
    }

    this.chunks = []
    this.bytes = 0
    this.send(encodeAudio({ kind: this.kind, epoch: this.epoch, frame: this.frame, pcm }))
    this.frame += 1
  }
}

/**
 * Ворклет микрофона звонка (ADR 0104): поток AudioContext любой частоты - в кадры PCM16 16 кГц
 * по 80 мс (1280 отсчётов), как их ждёт Flux STT. Понижение частоты - средним по окну шага: речи
 * хватает, а AudioContext с 16 кГц Chromium с микрофоном 48 кГц соединяет не везде. Исполняется
 * в AudioWorkletGlobalScope, где нет ни DOM, ни импортов, - типы этого мира объявлены здесь.
 */

declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor & {
    process: (inputs: Float32Array[][]) => boolean
  },
): void

const TARGET_RATE = 16000
const FRAME_SAMPLES = 1280

class MicFrames extends AudioWorkletProcessor {
  private readonly step = sampleRate / TARGET_RATE
  private sum = 0
  private count = 0
  private carry = 0
  private frame = new Int16Array(FRAME_SAMPLES)
  private filled = 0

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]

    if (!input) return true

    for (const sample of input) {
      this.sum += sample
      this.count += 1
      this.carry += 1

      if (this.carry < this.step) continue

      this.carry -= this.step
      this.push(this.sum / this.count)
      this.sum = 0
      this.count = 0
    }

    return true
  }

  private push(value: number): void {
    const clamped = Math.max(-1, Math.min(1, value))

    this.frame[this.filled] = Math.round(clamped * 0x7fff)
    this.filled += 1

    if (this.filled < FRAME_SAMPLES) return

    this.port.postMessage(this.frame.buffer, [this.frame.buffer])
    this.frame = new Int16Array(FRAME_SAMPLES)
    this.filled = 0
  }
}

registerProcessor('mic-frames', MicFrames)

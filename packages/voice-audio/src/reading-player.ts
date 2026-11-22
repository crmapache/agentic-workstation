import { PLAY_RATE } from './answer-player'
import { pcmToFloat } from './pcm'

/** Запас перед первым куском: сетевой рывок не обрывает речь на полуслове. */
const LEAD_S = 0.15

/**
 * Динамик «Прочитать вслух» (ADR 0106): куски звука ответа подряд по мере прихода - синтез ещё
 * идёт, а начало уже звучит. Свой AudioContext на чтение: закрывается, когда дозвучало или
 * остановили, и не держит звуковое устройство. На телефоне создаётся прямо в нажатии кнопки -
 * Safari даёт звучать только звуку, начатому человеком.
 */
export class ReadingPlayer {
  private readonly context = new AudioContext()
  private sources: AudioBufferSourceNode[] = []
  private end = 0
  /** Звука больше не будет: дозвучит последний кусок - конец. */
  private finished = false
  private over = false
  private readonly onEnded: () => void

  constructor(onEnded: () => void) {
    this.onEnded = onEnded
    void this.context.resume()
  }

  push(pcm: Uint8Array): void {
    if (this.over) return

    const samples = pcmToFloat(pcm)

    if (samples.length === 0) return

    const buffer = this.context.createBuffer(1, samples.length, PLAY_RATE)
    const source = this.context.createBufferSource()
    const start = Math.max(this.context.currentTime + LEAD_S, this.end)

    buffer.copyToChannel(samples, 0)
    source.buffer = buffer
    source.connect(this.context.destination)
    source.onended = () => {
      this.sources = this.sources.filter((known) => known !== source)
      if (this.finished && this.sources.length === 0) this.close(true)
    }
    source.start(start)
    this.sources.push(source)
    this.end = start + buffer.duration
  }

  /** Весь звук пришёл: дозвучит - onEnded. Звука не было вовсе - конец сразу. */
  finish(): void {
    this.finished = true
    if (this.sources.length === 0) this.close(true)
  }

  /** Тишина сейчас. onEnded не зовётся: остановивший и так знает, что чтения больше нет. */
  stop(): void {
    this.close(false)
  }

  private close(natural: boolean): void {
    if (this.over) return

    this.over = true

    for (const source of this.sources) {
      source.onended = null
      source.stop()
    }

    this.sources = []
    void this.context.close()
    if (natural) this.onEnded()
  }
}

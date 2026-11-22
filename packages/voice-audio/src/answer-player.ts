import { pcmToFloat } from './pcm'
import { EpochClock } from './played'

/** Частота ответа: родная у голосов Flux TTS, её же просит главный процесс IDE. */
export const PLAY_RATE = 24000

/** Запас перед первым куском: сетевой рывок не обрывает речь на полуслове (spec: 100-200 мс). */
const LEAD_S = 0.15
/** Как часто сообщать главному процессу, сколько проиграно (spec, «Протокол через релей»). */
const REPORT_MS = 200
/** Плавность приглушения и возврата громкости. */
const DUCK_TIME_S = 0.03

/**
 * Динамик звонка в окне: кадры ответа эпохи - подряд в AudioContext, с небольшим буфером.
 * Приглушение - громкостью, перебивание - новой эпохой: всё непроигранное и кадры прежних эпох
 * выкидываются. Сколько эпохи прозвучало - отчётом раз в 200 мс, пока есть что играть.
 */
export class AnswerPlayer {
  private readonly context = new AudioContext()
  private readonly gain = this.context.createGain()
  private sources: AudioBufferSourceNode[] = []
  private readonly clock = new EpochClock()
  private epoch = 0
  private end = 0
  private readonly timer: ReturnType<typeof setInterval>

  private readonly onPlayed: (epoch: number, ms: number) => void

  constructor(onPlayed: (epoch: number, ms: number) => void) {
    this.onPlayed = onPlayed
    this.gain.connect(this.context.destination)
    // Создан в нажатии кнопки - Safari даст ему звучать; спящий будится здесь же.
    void this.context.resume()
    this.timer = setInterval(() => this.report(), REPORT_MS)
  }

  play(epoch: number, pcm: Uint8Array): void {
    if (epoch < this.epoch) return
    if (epoch > this.epoch) this.stop(epoch)

    const samples = pcmToFloat(pcm)

    if (samples.length === 0) return

    const buffer = this.context.createBuffer(1, samples.length, PLAY_RATE)

    buffer.copyToChannel(samples, 0)

    const source = this.context.createBufferSource()
    const start = Math.max(this.context.currentTime + LEAD_S, this.end)

    source.buffer = buffer
    source.connect(this.gain)
    source.start(start)
    source.onended = () => {
      this.sources = this.sources.filter((known) => known !== source)
    }
    this.sources.push(source)
    this.clock.add({ start, duration: buffer.duration })
    this.end = start + buffer.duration
  }

  duck(level: number): void {
    this.gain.gain.setTargetAtTime(level, this.context.currentTime, DUCK_TIME_S)
  }

  /** Перебили: тишина сразу, счёт эпохи epoch - с нуля. */
  stop(epoch: number): void {
    for (const source of this.sources) source.stop()

    this.sources = []
    this.clock.reset()
    this.end = 0
    this.epoch = epoch
    this.gain.gain.cancelScheduledValues(this.context.currentTime)
    this.gain.gain.setValueAtTime(1, this.context.currentTime)
  }

  /** Тихий сигнал «я ещё тут» или «соединено»: короткий тон, не мешающий говорить. */
  tone(frequency = 660): void {
    const oscillator = this.context.createOscillator()
    const volume = this.context.createGain()
    const now = this.context.currentTime

    oscillator.frequency.value = frequency
    volume.gain.setValueAtTime(0, now)
    volume.gain.linearRampToValueAtTime(0.06, now + 0.02)
    volume.gain.linearRampToValueAtTime(0, now + 0.18)
    oscillator.connect(volume)
    volume.connect(this.context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.2)
  }

  close(): void {
    clearInterval(this.timer)
    this.stop(this.epoch)
    void this.context.close()
  }

  /** Отчёт, пока есть что играть; дозвучало всё - последний отчёт, и молчать до новых кадров. */
  private report(): void {
    if (!this.clock.isPlaying) return

    this.onPlayed(this.epoch, Math.round(this.clock.played(this.context.currentTime)))
  }
}

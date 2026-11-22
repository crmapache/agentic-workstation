/** Кусок ответа на шкале AudioContext: с какой секунды и сколько секунд звучит. */
export type PlayedSegment = { start: number; duration: number }

/**
 * Сколько миллисекунд эпохи реально прозвучало к моменту now: по кускам, а не от начала
 * первого - пауза, пока следующий кусок опаздывал, проигранным не считается.
 */
export const playedMs = (segments: readonly PlayedSegment[], now: number): number =>
  segments.reduce(
    (sum, { start, duration }) => sum + Math.min(duration, Math.max(0, now - start)) * 1000,
    0,
  )

/**
 * Часы эпохи ответа: сколько прозвучало с её начала, сквозь паузы между ответами. Дозвучавшие
 * куски сворачиваются в сумму, а не забываются: звонок считает место обрыва от начала эпохи, и
 * второй ответ эпохи, отсчитанный с нуля, «звучал» бы дольше, чем на самом деле. Новая эпоха -
 * счёт с нуля.
 */
export class EpochClock {
  private done = 0
  private segments: PlayedSegment[] = []

  /** Есть ли куски, которые ещё звучат или ждут: пока есть - отчёт нужен. */
  get isPlaying(): boolean {
    return this.segments.length > 0
  }

  add(segment: PlayedSegment): void {
    this.segments.push(segment)
  }

  /** Прозвучало к now; дозвучавшие куски уходят в сумму. */
  played(now: number): number {
    const finished = this.segments.filter(({ start, duration }) => now >= start + duration)

    if (finished.length > 0) {
      this.done += playedMs(finished, now)
      this.segments = this.segments.filter((segment) => !finished.includes(segment))
    }

    return this.done + playedMs(this.segments, now)
  }

  reset(): void {
    this.done = 0
    this.segments = []
  }
}

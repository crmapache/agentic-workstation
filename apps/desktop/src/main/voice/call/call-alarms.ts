import type { Timer } from './utterances'

/**
 * Будильники звонка: долгая тишина, прощание после «ты ещё тут?», тихий сигнал, пока агент
 * работает молча, и ожидание пропавшей связи.
 */
export type CallAlarm = 'silence' | 'goodbye' | 'tone' | 'line'

/** Будильники звонка по имени: у каждого не больше одного, сработавший забывается сам. */
export class CallAlarms {
  private readonly cancels = new Map<CallAlarm, () => void>()

  constructor(private readonly timer: Timer) {}

  arm(name: CallAlarm, run: () => void, ms: number): void {
    this.disarm(name)
    this.cancels.set(
      name,
      this.timer(() => {
        this.cancels.delete(name)
        run()
      }, ms),
    )
  }

  disarm(name: CallAlarm): void {
    this.cancels.get(name)?.()
    this.cancels.delete(name)
  }

  has(name: CallAlarm): boolean {
    return this.cancels.has(name)
  }

  /** Звонок кончился: ни один будильник больше не звенит. */
  clear(): void {
    for (const cancel of this.cancels.values()) cancel()

    this.cancels.clear()
  }
}

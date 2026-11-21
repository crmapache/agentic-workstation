/**
 * Часы правок (гибридные логические): время в мс, счётчик внутри одной мс и метка компьютера.
 * Строки сравниваются как есть: поздняя правка поля побеждает раннюю на любом компьютере, а
 * равных строк у двух компьютеров не бывает. Часы не идут назад: увидев правку из будущего
 * (часы другого компьютера спешат), они продолжают от неё.
 */
export class TrackerClock {
  private ms = 0
  private count = 0

  constructor(
    private readonly node: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Отметка новой правки: больше всех, что эти часы выдали или видели. */
  tick(): string {
    const now = this.now()

    if (now > this.ms) {
      this.ms = now
      this.count = 0
    } else {
      this.count += 1
    }

    return `${this.ms.toString(36).padStart(9, '0')}.${this.count.toString(36).padStart(4, '0')}.${this.node}`
  }

  /** Учесть чужую отметку, чтобы следующая своя была позже неё. */
  observe(stamp: string) {
    const [msText, countText] = stamp.split('.')
    const ms = parseInt(msText ?? '', 36)
    const count = parseInt(countText ?? '', 36)

    if (!Number.isFinite(ms) || !Number.isFinite(count)) return

    if (ms > this.ms || (ms === this.ms && count > this.count)) {
      this.ms = ms
      this.count = count
    }
  }
}

/** Метка компьютера для часов: случайная, своя у каждой установки IDE. */
export const NODE_ID = /^[a-z0-9]{8}$/

/** Новая метка компьютера. */
export const newNodeId = (random: () => number = Math.random): string =>
  Array.from({ length: 8 }, () => Math.floor(random() * 36).toString(36)).join('')

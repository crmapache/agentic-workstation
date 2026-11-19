import type { SandboxLimits } from './sandbox.constants'
import { TIMEOUT_MIN_MS, INTERVAL_MIN_MS } from './sandbox.constants'

/** Таймер вышел: позвать колбэк расширения; once - разовый, его колбэк потом забыть. */
type Fire = (handler: number, once: boolean) => void

/**
 * Таймеры песочницы: setTimeout и setInterval расширения - таймеры Node с пределом числа и
 * частоты. Сам колбэк живёт в песочнице, здесь - только его номер.
 */
export class SandboxTimers {
  private readonly live = new Map<number, NodeJS.Timeout>()
  private nextId = 1

  constructor(
    private readonly limits: SandboxLimits,
    private readonly fire: Fire,
  ) {}

  set(handler: number, ms: number, repeat: boolean): number {
    if (this.live.size >= this.limits.timers) {
      throw new Error(`Too many timers: an extension may keep ${this.limits.timers} at once.`)
    }

    const id = this.nextId++
    const delay = Math.max(repeat ? INTERVAL_MIN_MS : TIMEOUT_MIN_MS, Number.isFinite(ms) ? ms : 0)

    if (repeat) {
      this.live.set(
        id,
        setInterval(() => this.fire(handler, false), delay),
      )
    } else {
      this.live.set(
        id,
        setTimeout(() => {
          this.live.delete(id)
          this.fire(handler, true)
        }, delay),
      )
    }

    // Таймер расширения не держит процесс: выход IDE его не ждёт.
    this.live.get(id)?.unref()

    return id
  }

  clear(id: number): void {
    const timer = this.live.get(id)

    if (!timer) return

    clearTimeout(timer)
    this.live.delete(id)
  }

  clearAll(): void {
    for (const timer of this.live.values()) clearTimeout(timer)

    this.live.clear()
  }
}

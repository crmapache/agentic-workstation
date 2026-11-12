/**
 * Сколько сессия разговора ждёт его новый процесс, когда прежний кончился. Процесс
 * разговора сменяется посреди работы (набор коннекторов, другой аккаунт, отложенный
 * перезапуск, сон после простоя): новый поднимается следующим сообщением человека, и его
 * вкладки браузера должны быть на месте. Не пришёл за это время - вкладки закрываются, как
 * по finish. Закрытая вкладка разговора не ждёт (end).
 */
export const SESSION_GRACE_MS = 10 * 60_000

/** Сколько кончившихся процессов помнить: отказ нужен вызову, пришедшему в последний миг. */
const RELEASED_MEMORY = 500

/** Вызов без процесса разговора (карточка, тест) - своя сессия. */
const NO_LAUNCH = 'no-launch'

/** Чей вызов: процесс (ключ запуска шлюза) и его разговор. */
export type CallOwner = { launchId: string | null; conversationId: string | null }

/** Сессия вызова: разговор, а без него - процесс. */
export const sessionIdOf = (owner: CallOwner): string =>
  owner.conversationId ?? owner.launchId ?? NO_LAUNCH

/**
 * Процессы сессий браузера (ADR 0040): какие процессы разговора живы, какие кончились, и
 * когда отпускать сессию, чей разговор больше не пришёл. Таймеры - через setTimeout с unref:
 * ожидание не держит выход IDE.
 */
export class SessionLaunches {
  private readonly released = new Set<string>()
  private readonly live = new Map<string, Set<string>>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    /** Сессию пора закончить: её разговор не вернулся или закрыт. */
    private readonly expire: (sessionId: string) => void,
    private readonly graceMs = SESSION_GRACE_MS,
  ) {}

  /** Процесс уже кончился: его вызов не должен открыть вкладку, которую некому закрыть. */
  isReleased(launchId: string | null): boolean {
    return launchId !== null && this.released.has(launchId)
  }

  /** Вызов процесса: сессия снова занята, ожидание отменяется. */
  touch(owner: CallOwner): void {
    const sessionId = sessionIdOf(owner)

    this.cancel(sessionId)

    if (!owner.launchId || owner.launchId === sessionId) return

    const launches = this.live.get(sessionId) ?? new Set<string>()

    launches.add(owner.launchId)
    this.live.set(sessionId, launches)
  }

  /**
   * Процесс кончился. Без разговора сессия была его - она кончается сразу. С разговором - ждёт
   * его следующий процесс, если другого живого у разговора нет.
   */
  release(launch: { id: string; conversationId: string | null }): void {
    this.remember(launch.id)

    if (!launch.conversationId) {
      this.expire(launch.id)

      return
    }

    const sessionId = launch.conversationId
    const launches = this.live.get(sessionId)

    launches?.delete(launch.id)

    if (launches?.size) return

    this.live.delete(sessionId)
    this.cancel(sessionId)

    const timer = setTimeout(() => {
      this.timers.delete(sessionId)
      this.expire(sessionId)
    }, this.graceMs)

    timer.unref()
    this.timers.set(sessionId, timer)
  }

  /** Разговор закрыт насовсем: его сессия кончается сразу, без ожидания. */
  end(conversationId: string): void {
    this.forget(conversationId)
    this.expire(conversationId)
  }

  /** Сессия кончилась иначе (finish, Stop): ждать и помнить её процессы незачем. */
  forget(sessionId: string): void {
    this.cancel(sessionId)
    this.live.delete(sessionId)
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)

    this.timers.clear()
    this.live.clear()
  }

  private cancel(sessionId: string): void {
    const timer = this.timers.get(sessionId)

    if (timer) clearTimeout(timer)

    this.timers.delete(sessionId)
  }

  private remember(launchId: string): void {
    this.released.add(launchId)

    if (this.released.size <= RELEASED_MEMORY) return

    const [oldest] = this.released

    if (oldest !== undefined) this.released.delete(oldest)
  }
}

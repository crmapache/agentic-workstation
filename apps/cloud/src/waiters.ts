/**
 * Ожидание забора (long-poll): IDE спрашивает «что нового после версии N» и, если нового нет,
 * сервер держит запрос, пока в тот же аккаунт не примут запись или не выйдет срок. Так другой
 * компьютер узнаёт о правке за доли секунды без опроса каждые пару секунд.
 *
 * Каждое ожидание держит соединение и таймер, поэтому их число ограничено и на аккаунт (одна
 * IDE не займёт всё), и всего (много ключей с одного адреса не съедят память). Сверх предела
 * забор отвечает сразу - IDE просто спросит снова.
 */
export class Waiters {
  private readonly waiting = new Map<string, Set<() => void>>()
  private readonly perAccount: number
  private readonly total: number
  private count = 0

  constructor(limits: { perAccount: number; total: number }) {
    this.perAccount = limits.perAccount
    this.total = limits.total
  }

  /**
   * Ждать записи в аккаунт key до ms или до отмены signal (клиент ушёл, сервер гаснет).
   * true - пришла запись, false - срок вышел или отменили; null - мест нет, ждать нельзя.
   */
  wait(key: string, ms: number, signal: AbortSignal): Promise<boolean> | null {
    const set = this.waiting.get(key) ?? new Set<() => void>()

    if (signal.aborted || set.size >= this.perAccount || this.count >= this.total) return null

    this.waiting.set(key, set)
    this.count += 1

    return new Promise((resolve) => {
      let settled = false
      const done = (woken: boolean) => {
        if (settled) return

        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        set.delete(wake)
        this.count -= 1

        if (set.size === 0 && this.waiting.get(key) === set) this.waiting.delete(key)

        resolve(woken)
      }
      const wake = () => done(true)
      const onAbort = () => done(false)
      const timer = setTimeout(() => done(false), ms)

      set.add(wake)
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  /** Разбудить всех, кто ждёт аккаунт key: в него только что приняли запись. */
  wake(key: string): void {
    const set = this.waiting.get(key)

    if (!set) return

    for (const wake of [...set]) wake()
  }
}

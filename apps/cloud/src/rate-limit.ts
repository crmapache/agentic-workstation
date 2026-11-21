/**
 * Итог попытки: можно; у ключа кончился предел; память под ключи кончилась - нового ключа не
 * заводим (сервер перегружен, а не этот звонящий частит).
 */
export type Take = 'ok' | 'limited' | 'full'

/** Выметать старые ключи не реже этого: у суточного предела окно длинное, а память нужна раньше. */
const PRUNE_EVERY_MS = 10 * 60_000

/**
 * Предел частоты по ключу (корзина адреса или ключ аккаунта): скользящее окно, в котором
 * считаются запросы. Память держится двумя вещами. Таймер выметает ключи, у которых все отметки
 * старше окна: проход по всей таблице раз в окно, а не на каждом запросе, как было бы при
 * «выметать, когда таблица выросла» (под потоком живых ключей это проход на каждый запрос).
 * Потолок ключей - на случай, когда живых ключей слишком много (тысячи сетей /64 за минуту):
 * новый ключ получает 'full', сервер отвечает 503, память не растёт.
 */
export class RateLimit {
  private readonly hits = new Map<string, number[]>()
  private readonly limit: number
  private readonly windowMs: number
  private readonly maxKeys: number
  private readonly now: () => number
  private readonly timer: NodeJS.Timeout

  constructor(options: { limit: number; windowMs: number; maxKeys: number; now?: () => number }) {
    this.limit = options.limit
    this.windowMs = options.windowMs
    this.maxKeys = options.maxKeys
    this.now = options.now ?? Date.now
    this.timer = setInterval(() => this.prune(), Math.min(this.windowMs, PRUNE_EVERY_MS))
    // Таймер не держит процесс: остановка сервера не ждёт следующей уборки.
    this.timer.unref()
  }

  /** Засчитать запрос ключа, если ещё можно. */
  take(key: string): Take {
    const known = this.hits.get(key)

    if (!known && this.hits.size >= this.maxKeys) return 'full'

    const now = this.now()
    const recent = (known ?? []).filter((at) => now - at < this.windowMs)

    if (recent.length >= this.limit) {
      this.hits.set(key, recent)

      return 'limited'
    }

    recent.push(now)
    this.hits.set(key, recent)

    return 'ok'
  }

  /** Забыть ключи, у которых все отметки вышли из окна (отметки идут по возрастанию). */
  prune(): void {
    const now = this.now()

    for (const [key, times] of this.hits) {
      if (now - (times.at(-1) ?? 0) >= this.windowMs) this.hits.delete(key)
    }
  }

  /** Сколько ключей сейчас помнится - для проверок. */
  get size(): number {
    return this.hits.size
  }

  dispose(): void {
    clearInterval(this.timer)
  }
}

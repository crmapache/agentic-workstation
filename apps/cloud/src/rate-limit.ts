/**
 * Предел частоты по ключу (адрес или ключ аккаунта): окно, в котором считаются запросы. Память
 * чистится сама - ключ без запросов дольше окна забывается.
 */
export class RateLimit {
  private readonly hits = new Map<string, number[]>()
  private readonly limit: number
  private readonly windowMs: number
  private readonly now: () => number

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
  }

  /** Можно ли ещё раз; true - запрос засчитан. */
  take(key: string): boolean {
    const now = this.now()
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs)

    if (recent.length >= this.limit) {
      this.hits.set(key, recent)

      return false
    }

    recent.push(now)
    this.hits.set(key, recent)

    if (this.hits.size > 50_000) this.sweep(now)

    return true
  }

  private sweep(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key)
    }
  }
}

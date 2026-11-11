import { addressHint } from './frame.ts'
import { readPushBody, pushEndpointAllowed } from './push-frame.ts'
import type { PushKeys } from './push-keys.ts'
import type { PushSender } from './push-sender.ts'

/**
 * Пуши: IDE просит разбудить телефон, которого нет на линии, - релей отдаёт запечатанный для
 * телефона payload службе пушей его браузера. Ничего не хранится: подписку приносит каждый кадр
 * FRAME_PUSH, а релей её только проверяет и забывает. Что релей видит - адрес службы пушей,
 * кому и когда, размер; текста уведомления - нет, он запечатан ключом пары.
 *
 * Пределы - от того, кто платит за поломку: ключ VAPID у служб один на весь релей, и чужой
 * поток пушей испортил бы его всем. Поэтому предел на IDE (её уведомления и так сложены по
 * разговору и поводу), общий предел на релей и потолок звонков в пути.
 */

export type PushLimits = {
  perMinute: number
  totalPerMinute: number
  ttlSeconds: number
  /** Сколько звонков службам в пути разом: медленная служба не должна держать память релея. */
  maxInFlight: number
}

const WINDOW_MS = 60_000

/** Ведро на минуту: наполняется ровно, до capacity за минуту. */
class Bucket {
  private readonly capacity: number
  private tokens: number
  private at: number

  constructor(capacity: number, now: number) {
    this.capacity = capacity
    this.tokens = capacity
    this.at = now
  }

  take(now: number): boolean {
    this.refill(now)

    if (this.tokens < 1) return false

    this.tokens -= 1

    return true
  }

  /** Полное ведро - то же, что никакого: его можно забыть. */
  full(now: number): boolean {
    this.refill(now)

    return this.tokens >= this.capacity
  }

  private refill(now: number) {
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (Math.max(0, now - this.at) * this.capacity) / WINDOW_MS,
    )
    this.at = now
  }
}

/** Служба сказала «такой подписки нет и не будет». Остальные отказы бывают и погодой. */
const GONE_STATUSES = new Set([404, 410])

export class Pushes {
  private readonly perSender = new Map<string, Bucket>()
  private readonly total: Bucket
  private readonly keys: PushKeys | null
  private readonly limits: PushLimits
  private readonly sender: PushSender
  private readonly log: (line: string) => void
  private inFlight = 0

  constructor(
    keys: PushKeys | null,
    limits: PushLimits,
    sender: PushSender,
    log: (line: string) => void,
  ) {
    this.keys = keys
    this.limits = limits
    this.sender = sender
    this.log = log
    this.total = new Bucket(limits.totalPerMinute, Date.now())
  }

  get enabled(): boolean {
    return this.keys !== null
  }

  /** Открытый ключ VAPID для подписки телефона (applicationServerKey); пусто - пушей нет. */
  get publicKey(): string {
    return this.keys?.publicKey ?? ''
  }

  /**
   * Кадр FRAME_PUSH от IDE: проверить, посчитать, отправить. gone - сказать IDE, что подписки
   * этого телефона больше нет: служба ответила 404 или 410, или адрес службы не из белого
   * списка (через этот релей такая подписка не заработает никогда). Обещание - для тестов:
   * релей его не ждёт.
   */
  async take(from: Buffer, body: Buffer, now: number, gone: () => void): Promise<void> {
    if (!this.keys) return

    const order = readPushBody(body)
    const who = addressHint(from)

    if (!order) return this.log(`${who} sent a push frame we could not read - dropped`)

    if (!pushEndpointAllowed(order.endpoint)) {
      this.log(`${who} asked to push to a host outside the allowlist - refused`)

      return gone()
    }

    if (!this.admit(from, now)) return this.log(`${who} is over its push rate - dropped`)

    this.inFlight += 1

    try {
      const status = await this.sender(order, { ttlSeconds: this.limits.ttlSeconds })

      if (status >= 200 && status < 300) return

      // Причина и хост службы, никогда не payload и не адрес подписки целиком.
      this.log(`push from ${who} refused by ${hostOf(order.endpoint)} (${status || 'no answer'})`)

      if (GONE_STATUSES.has(status)) gone()
    } finally {
      this.inFlight -= 1
    }
  }

  /** Сердцебиение релея: полные вёдра тех, кто давно не пушил, - вон. */
  sweep(now: number): void {
    for (const [key, bucket] of this.perSender) if (bucket.full(now)) this.perSender.delete(key)
  }

  private admit(from: Buffer, now: number): boolean {
    if (this.inFlight >= this.limits.maxInFlight) return false

    const key = from.toString('base64url')
    const bucket = this.perSender.get(key) ?? new Bucket(this.limits.perMinute, now)

    this.perSender.set(key, bucket)

    return bucket.take(now) && this.total.take(now)
  }
}

const hostOf = (endpoint: string): string => {
  try {
    return new URL(endpoint).hostname
  } catch {
    return 'an unknown host'
  }
}

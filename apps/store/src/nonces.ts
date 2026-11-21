/**
 * Та же книга, что у облака (apps/cloud/src/nonces.ts): приложения не импортируют друг друга.
 *
 * Разовые числа принятых подписей. Помнить каждое надо, пока подпись с ним ещё может пройти:
 * число увидено в момент t, время подписи не дальше окна W от t, подпись годна ещё W после
 * своего времени - итого до t + 2W. Поэтому два поколения меняются раз в keepMs = 2W: число
 * живёт в текущем поколении, потом в прошлом, и забывается не раньше чем через keepMs.
 *
 * Смена поколения - выброс целой таблицы, а не проход по ней: под потоком запросов уборка не
 * становится проходом на каждый запрос. Потолок - на случай потока подписанных запросов с
 * многих адресов: дальше книга полна, сервер отвечает 503, память не растёт.
 */
export class NonceBook {
  private current = new Set<string>()
  private previous = new Set<string>()
  private rotatedAt: number
  private readonly keepMs: number
  private readonly cap: number

  constructor(options: { keepMs: number; cap: number }, now: number) {
    this.keepMs = options.keepMs
    this.cap = options.cap
    this.rotatedAt = now
  }

  /** Было ли число среди помнящихся (в любом из поколений). */
  has(nonce: string, now: number): boolean {
    this.rotate(now)

    return this.current.has(nonce) || this.previous.has(nonce)
  }

  /** Полна ли книга: новое число запомнить некуда. */
  isFull(now: number): boolean {
    this.rotate(now)

    return this.current.size + this.previous.size >= this.cap
  }

  add(nonce: string, now: number): void {
    this.rotate(now)
    this.current.add(nonce)
  }

  /**
   * Смена поколений, когда пришло время. Прошло два срока - все числа текущего поколения
   * записаны раньше прошлой смены (иначе она бы случилась тогда) и старше keepMs: выбросить оба.
   */
  private rotate(now: number) {
    const passed = now - this.rotatedAt

    if (passed < this.keepMs) return

    this.previous = passed >= this.keepMs * 2 ? new Set() : this.current
    this.current = new Set()
    this.rotatedAt = now
  }
}

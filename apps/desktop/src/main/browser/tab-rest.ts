import type { HeldTab, BrowserSessions } from './browser-sessions'

/**
 * Курсор и рамка агента в странице и плашка отладчика Chrome - только пока агент работает
 * (ADR 0040). Вкладка отдыхает - отладчик и рамка уходят, а вкладка остаётся в сессии, и
 * следующий вызов подключит её снова, - когда работа разговора встала (конец хода, процесс
 * кончился) или агент не трогал её дольше срока простоя. Иначе курсор стоял бы на странице
 * человека, пока открыта вкладка разговора.
 *
 * Пока идёт вызов сессии (фоновый агент работает и после конца хода), её вкладки не трогаются:
 * отдых ждёт конца вызовов. А вызов ждёт конца отдыха, который уже начался: рамку, снятую
 * посреди его подключения, никто бы не вернул.
 */
export class TabRest {
  private readonly running = new Map<string, number>()
  /** Сессии, чья работа встала, пока шёл вызов: отдых - после последнего вызова. */
  private readonly deferred = new Set<string>()
  private readonly resting = new Map<string, Promise<void>>()

  constructor(
    private readonly sessions: BrowserSessions,
    private readonly letGo: (tab: HeldTab) => Promise<void>,
  ) {}

  /** Вызов инструмента сессии: работа идёт, пока он не кончится. */
  async during<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    // Новый вызов - работа снова идёт: отложенный отдых уже не к месту.
    this.deferred.delete(sessionId)
    this.running.set(sessionId, (this.running.get(sessionId) ?? 0) + 1)

    try {
      await this.resting.get(sessionId)

      return await work()
    } finally {
      const left = (this.running.get(sessionId) ?? 1) - 1

      if (left > 0) this.running.set(sessionId, left)
      else this.running.delete(sessionId)

      if (left <= 0 && this.deferred.delete(sessionId)) this.rest(sessionId, () => true)
    }
  }

  /** Работа разговора встала: его вкладки отдыхают сейчас или после идущих вызовов. */
  idle(sessionId: string): void {
    if (this.running.has(sessionId)) this.deferred.add(sessionId)
    else this.rest(sessionId, () => true)
  }

  /** Вкладки, которых агент не трогал дольше idleMs, отдыхают; у сессии с вызовом - нет. */
  sweep(now: number, idleMs: number): void {
    for (const session of this.sessions.all()) {
      if (!this.running.has(session.id)) {
        this.rest(session.id, (tab) => now - tab.lastUsed > idleMs)
      }
    }
  }

  /**
   * Отпустить вкладки сессии, у которых есть что снимать. Профиль не на связи - его вкладки
   * ждут: рамка в странице жива, а снять её сейчас нечем; снимет срок простоя, когда профиль
   * вернётся.
   */
  private rest(sessionId: string, due: (tab: HeldTab) => boolean): void {
    const tabs = [...(this.sessions.get(sessionId)?.tabs.values() ?? [])].filter(
      (tab) => !tab.offline && (tab.attached || tab.framed) && due(tab),
    )

    if (!tabs.length) return

    const before = this.resting.get(sessionId) ?? Promise.resolve()
    const resting: Promise<void> = before
      .then(async () => {
        for (const tab of tabs) await this.letGo(tab)
      })
      .catch((error: unknown) => console.warn('[browser] вкладка не отпущена', error))
      .finally(() => {
        if (this.resting.get(sessionId) === resting) this.resting.delete(sessionId)
      })

    this.resting.set(sessionId, resting)
  }
}

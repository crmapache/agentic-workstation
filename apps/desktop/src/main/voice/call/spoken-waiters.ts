/**
 * Кто ждёт, пока прозвучат ответы, которые рот звонка держал в момент вопроса (такт показа
 * Walkthrough, ADR 0134). Ответы рта - по id элемента ленты.
 */
export class SpokenWaiters {
  private waiters: { ids: ReadonlySet<string>; resolve: (spoken: boolean) => void }[] = []

  /** Ждать, пока уйдут эти ответы; их нет - сразу true. */
  wait(ids: ReadonlySet<string>): Promise<boolean> {
    if (ids.size === 0) return Promise.resolve(true)

    return new Promise((resolve) => this.waiters.push({ ids, resolve }))
  }

  /**
   * Ответы ушли из рта (left - кто остался): тот, кто ждал их все, узнаёт, прозвучали они (true)
   * или хоть один оборвали (silenced - false).
   */
  wake(left: ReadonlySet<string>, silenced: ReadonlySet<string>): void {
    this.waiters = this.waiters.filter(({ ids, resolve }) => {
      if ([...ids].some((id) => left.has(id))) return true

      resolve(![...ids].some((id) => silenced.has(id)))

      return false
    })
  }

  /** Рот погашен: никто не дождётся - всё оборвано. */
  cancel(): void {
    for (const waiter of this.waiters) waiter.resolve(false)

    this.waiters = []
  }
}

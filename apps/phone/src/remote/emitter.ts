/** Слушатели одного события. */
type Handlers = Map<PropertyKey, Set<(...args: never[]) => void>>

/**
 * Маленький разносчик событий ядра: ядро не знает ни React, ни React Query - кэш окна
 * подписывается на него сам (state/mirror.ts), а тест слушает напрямую.
 */
export class Emitter<Events extends Record<string, (...args: never[]) => void>> {
  private readonly handlers: Handlers = new Map()

  on<K extends keyof Events>(event: K, handler: Events[K]): () => void {
    const set = this.handlers.get(event) ?? new Set()

    set.add(handler)
    this.handlers.set(event, set)

    return () => {
      set.delete(handler)
    }
  }

  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    for (const handler of this.handlers.get(event) ?? []) {
      ;(handler as (...values: Parameters<Events[K]>) => void)(...args)
    }
  }
}

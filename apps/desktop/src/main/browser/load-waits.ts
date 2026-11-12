import type { LoadWaiters } from './page'

/**
 * Кто ждёт загрузки страницы во вкладке: событие Page.loadEventFired или «вкладка загружена»
 * будит всех ждущих этой вкладки. Не дождались - ответ false, а не ошибка: страница могла
 * загружаться бесконечно (потоковое видео, долгий опрос).
 */
export class LoadWaitList implements LoadWaiters {
  private readonly waiting = new Map<string, Set<(loaded: boolean) => void>>()

  wait(key: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const waiters = this.waiting.get(key) ?? new Set()
      const done = (loaded: boolean) => {
        clearTimeout(timer)
        waiters.delete(done)

        if (!waiters.size) this.waiting.delete(key)

        resolve(loaded)
      }
      const timer = setTimeout(() => done(false), timeoutMs)

      waiters.add(done)
      this.waiting.set(key, waiters)
    })
  }

  resolve(key: string): void {
    for (const done of [...(this.waiting.get(key) ?? [])]) done(true)
  }
}

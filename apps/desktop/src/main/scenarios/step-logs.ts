import type { StepLogPage } from '@shared/scenario-view'

import type { StepFeed } from '../providers/scenario-provider'

/** Сколько открытых логов держать: экран прогона показывает один, рядом - пара вкладок. */
const KEPT = 6

/** Откуда лента разговора шага: провайдер прогона (его stepFeed); null - провайдера нет. */
export type StepFeedOf = (cwd: string, conversationId: string) => Promise<StepFeed | null>

/**
 * Лог шага (sendLog в ACC) не хранится вовсе: шаг - обычный разговор провайдера, его журнал
 * уже на диске (транскрипт Claude, поток Codex, сессия OpenCode). Читается тем же путём, что
 * лента вкладки провайдера: концом вперёд, начало - страницами («load earlier messages»).
 * Второй копии, которая умеет только протухать, нет.
 */
export class StepLogs {
  private readonly open = new Map<string, StepFeed>()
  /**
   * Сколько ранних страниц человек подгрузил: идущий шаг перечитывается заново на каждое
   * обновление, и без этого счёта подгруженное начало пропадало бы через три секунды.
   */
  private readonly earlier = new Map<string, number>()

  async page(
    feedOf: StepFeedOf | null,
    cwd: string,
    conversationId: string,
    earlier: boolean,
  ): Promise<StepLogPage> {
    const key = `${cwd}\0${conversationId}`
    let feed = this.open.get(key)
    const fresh = !feed

    if (!feed) {
      feed = (await feedOf?.(cwd, conversationId)) ?? undefined

      if (!feed) return { found: false, feed: null }

      this.open.set(key, feed)

      for (const stale of [...this.open.keys()].slice(0, Math.max(0, this.open.size - KEPT))) {
        this.open.get(stale)?.dispose()
        this.open.delete(stale)
        this.earlier.delete(stale)
      }
    }

    if (earlier) this.earlier.set(key, (this.earlier.get(key) ?? 0) + 1)

    await feed.ensureLoaded()

    // Перечитанный заново журнал возвращает подгруженное раньше начало, кроме страницы,
    // которую просят сейчас: её подгрузит вызов ниже.
    const replay = fresh ? (this.earlier.get(key) ?? 0) - (earlier ? 1 : 0) : 0

    for (let page = 0; page < replay; page += 1) await feed.loadEarlier()

    const snapshot = earlier ? await feed.loadEarlier() : feed.snapshot()

    return { found: snapshot.items.length > 0, feed: snapshot }
  }

  /** Карточка ещё работает: лог перечитывается с диска при следующем открытии. */
  forget(conversationId: string): void {
    for (const [key, feed] of this.open) {
      if (key.endsWith(`\0${conversationId}`)) {
        feed.dispose()
        this.open.delete(key)
      }
    }
  }
}

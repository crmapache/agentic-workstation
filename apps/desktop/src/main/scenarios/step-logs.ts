import type { StepLogPage } from '@shared/scenario-view'

import { ConversationFeedSync } from '../claude/conversation/conversation-feed'
import { findTranscript } from '../claude/history/transcript-paths'
import { makeThumbnail } from '../claude/images/thumbnail'

/** Сколько открытых логов держать: экран прогона показывает один, рядом - пара вкладок. */
const KEPT = 6

/**
 * Лог шага (sendLog в ACC) не хранится вовсе: шаг - обычный разговор CLI, его транскрипт уже
 * на диске. Читается тем же путём, что лента вкладки: концом вперёд, начало - страницами
 * («load earlier messages»). Второй копии, которая умеет только протухать, нет.
 */
export class StepLogs {
  private readonly open = new Map<string, ConversationFeedSync>()

  async page(projectPath: string, conversationId: string, earlier: boolean): Promise<StepLogPage> {
    if (!(await findTranscript(projectPath, conversationId))) return { found: false, feed: null }

    const key = `${projectPath}\0${conversationId}`
    let feed = this.open.get(key)

    if (!feed) {
      // Живые патчи логу не нужны: окно спрашивает страницы, а не слушает поток.
      feed = new ConversationFeedSync(conversationId, () => undefined, makeThumbnail)
      this.open.set(key, feed)

      for (const stale of [...this.open.keys()].slice(0, Math.max(0, this.open.size - KEPT))) {
        this.open.get(stale)?.dispose()
        this.open.delete(stale)
      }
    }

    await feed.ensureLoaded(projectPath, conversationId, null)

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

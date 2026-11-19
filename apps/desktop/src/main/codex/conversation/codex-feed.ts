import type { ForkOrigin, ImageAttachment } from '@shared/conversation'
import type { FeedItem, FeedPatch, ConversationFeed } from '@shared/conversation-feed'

import type { CodexTurnsPage } from '../catalog/catalog-shapes'
import { CodexFeedBuilder } from '../feed/codex-feed-builder'
import { replayTurns } from '../feed/codex-replay'
import { CodexTurnLog } from '../feed/codex-turn-log'
import type { AgentFeed } from '../../agents/conversation/agent-parts'
import { FEED_FLUSH_MS } from '../../agents/conversation/conversation.constants'

/** Сколько страниц источника листать в поисках точки неродившегося форка. */
const FORK_SEEK_PAGES = 20

/** Откуда лента берёт прошлые ходы: поток разговора и страница его журнала. */
export type CodexHistory = {
  /** id потока разговора; пусто - потока ещё нет (новый разговор или неродившийся форк). */
  threadId: () => string
  turns: (threadId: string, cursor: string | null) => Promise<CodexTurnsPage>
  /** Откуда разговор ответвлён: шов после последнего унаследованного хода. */
  fork: () => ForkOrigin | null
}

/**
 * Лента разговора Codex для ядра (AgentFeed): сборщик и рассылка изменений окну пачками.
 * Прошлые ходы - из журнала потока (`thread/turns/list`) страницами с конца: последняя - при
 * открытии, ранние - по «load earlier» и прыжку к закреплённому.
 */
export class CodexFeedSync implements AgentFeed {
  readonly builder: CodexFeedBuilder
  /** Ходы по порядку и сообщения, которыми они начаты, - для форка и отката. */
  readonly turns = new CodexTurnLog()
  /** Картинки сообщений целиком (data URL) по id сообщения - окно открывает их по запросу. */
  readonly images = new Map<string, readonly string[]>()
  private flushTimer: NodeJS.Timeout | null = null
  private loading: Promise<void> | null = null
  private paging: Promise<void> | null = null
  /** Курсор страницы раньше загруженного; null - раньше ничего. */
  private cursor: string | null = null
  /** Чей журнал листает курсор: у неродившегося форка - источника. */
  private cursorThread = ''
  private pages = 0
  private earlierChanged = false

  constructor(
    private readonly conversationId: string,
    private readonly onPatch: (patch: FeedPatch) => void,
    private readonly thumbnail: (image: ImageAttachment) => string,
    private readonly history: CodexHistory,
  ) {
    this.builder = new CodexFeedBuilder(thumbnail)
  }

  get hasEarlier(): boolean {
    return this.cursor !== null
  }

  /** Последняя страница журнала - один раз за жизнь разговора; новый разговор - сразу. */
  ensureLoaded(): Promise<void> {
    this.loading ??= this.readPage(null)

    return this.loading
  }

  snapshot(): ConversationFeed {
    return {
      conversationId: this.conversationId,
      items: [...this.builder.items],
      tasks: this.builder.tasks,
      hasEarlier: this.hasEarlier,
    }
  }

  async loadEarlier(): Promise<ConversationFeed> {
    await this.loading

    if (this.hasEarlier) await this.page()

    return this.snapshot()
  }

  /** Страницы раньше - пока не встанет itemId (прыжок к закреплённому) или журнал не кончится. */
  async loadThrough(itemId: string): Promise<ConversationFeed> {
    await this.loading

    while (this.hasEarlier && !this.builder.items.some((item) => item.id === itemId)) {
      await this.page()
    }

    return this.snapshot()
  }

  /** Загруженные - из ленты; что выше, журнал страницами не отдаёт без ленты - не ищется. */
  async itemsById(itemIds: readonly string[]): Promise<FeedItem[] | null> {
    await this.loading

    const wanted = new Set(itemIds)

    return this.builder.items.filter((item) => wanted.has(item.id))
  }

  /** Изменения - окну пачкой раз в пару кадров. */
  schedule(): void {
    this.flushTimer ??= setTimeout(() => this.flush(), FEED_FLUSH_MS)
  }

  flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)

    this.flushTimer = null

    const { upserts, removes, tasks } = this.builder.drain()
    const hasEarlier = this.earlierChanged ? this.hasEarlier : undefined

    this.earlierChanged = false

    if (upserts.length === 0 && removes.length === 0 && !tasks && hasEarlier === undefined) return

    this.onPatch({ conversationId: this.conversationId, upserts, removes, tasks, hasEarlier })
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)

    this.flushTimer = null
  }

  /** Одна страница за раз: просьба, пока страница едет, получает её же, а не вторую. */
  private async page(): Promise<void> {
    this.paging ??= this.readPage(this.cursor).finally(() => {
      this.paging = null
    })
    await this.paging
  }

  /**
   * Страница журнала перед загруженным - перед лентой. Окну она уходит лентой целиком (getFeed,
   * ответ loadEarlier), а не патчем. Журнал не прочитался - лента начинается с того, что есть.
   */
  /**
   * Страница журнала; through - точка неродившегося форка: ходы источника после неё не его,
   * и страницы листаются, пока точка не встретится.
   */
  private async sourcePage(
    threadId: string,
    cursor: string | null,
    through: string | null,
  ): Promise<CodexTurnsPage> {
    let page = await this.history.turns(threadId, cursor)

    if (through === null || cursor !== null) return page

    for (let left = FORK_SEEK_PAGES; left > 0; left -= 1) {
      const at = page.turns.findIndex((turn) => turn.id === through)

      if (at >= 0) return { ...page, turns: page.turns.slice(at) }
      if (!page.nextCursor) break

      page = await this.history.turns(threadId, page.nextCursor)
    }

    return { turns: [], nextCursor: null }
  }

  private async readPage(cursor: string | null): Promise<void> {
    const fork = this.history.fork()
    // Форк, у которого ещё нет своего потока, показывает источник до своей точки.
    const unborn = !this.history.threadId() && fork?.at ? fork : null
    // Курсор - чужой потоку, у которого его не брали: ранние страницы - из того же журнала.
    const threadId =
      cursor !== null
        ? this.cursorThread
        : this.history.threadId() || (unborn?.sourceSessionId ?? '')

    if (!threadId) return

    try {
      const page = await this.sourcePage(threadId, cursor, unborn?.at ?? null)
      const seam = fork
        ? { at: fork.at, title: fork.sourceTitle, sourceSessionId: fork.sourceSessionId }
        : null

      this.pages += 1

      const replayed = replayTurns(page.turns.toReversed(), `p${this.pages}-`, this.thumbnail, seam)

      this.builder.prepend(replayed.items)
      this.turns.prepend(replayed.log)
      for (const [messageId, urls] of replayed.images) this.images.set(messageId, urls)
      this.cursor = page.turns.length > 0 ? page.nextCursor : null
      this.cursorThread = threadId
      this.earlierChanged = true
    } catch (error) {
      console.warn('[codex] журнал разговора не прочитался:', threadId, error)
      this.cursor = null
    }
  }
}

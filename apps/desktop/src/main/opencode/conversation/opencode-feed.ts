import type { ForkOrigin, ImageAttachment } from '@shared/conversation'
import type { FeedItem, FeedPatch, ConversationFeed } from '@shared/conversation-feed'

import type { MessagesPage } from '../catalog/opencode-catalog'
import { OpenCodeFeedBuilder } from '../feed/opencode-feed-builder'
import { replayMessages } from '../feed/opencode-replay'
import type { ToolContext } from '../feed/opencode-tools'
import type { AgentFeed } from '../../agents/conversation/agent-parts'
import { FEED_FLUSH_MS } from '../../agents/conversation/conversation.constants'

/** Сообщения журнала, с которых ход не начинается: ответ модели, конец хода, сжатие. */
const MID_TURN: ReadonlySet<string> = new Set(['assistant', 'idle', 'compaction'])

/** Откуда лента берёт прошлые сообщения: сессия разговора и страница её журнала. */
export type OpenCodeHistory = {
  /** id сессии; пусто - сессии ещё нет (новый разговор). */
  sessionId: () => string
  messages: (sessionId: string, cursor: string | null) => Promise<MessagesPage>
  /** Откуда разговор ответвлён: шов после унаследованных сообщений. */
  fork: () => ForkOrigin | null
}

/**
 * Лента разговора OpenCode для ядра (AgentFeed): сборщик и рассылка изменений окну пачками.
 * Прошлые сообщения - из журнала сессии страницами с конца: последняя - при открытии, ранние -
 * по «load earlier» и прыжку к закреплённому. Своё сообщение лента зовёт своим id, а OpenCode
 * даёт ему свой: соответствие нужно откату и форку.
 */
export class OpenCodeFeedSync implements AgentFeed {
  readonly builder: OpenCodeFeedBuilder
  /** Картинки сообщений целиком (data URL) по id сообщения - окно открывает их по запросу. */
  readonly images = new Map<string, readonly string[]>()
  /** id сообщения у OpenCode по id в ленте: у сообщений из журнала они совпадают. */
  private readonly openCodeIds = new Map<string, string>()
  private flushTimer: NodeJS.Timeout | null = null
  private loading: Promise<void> | null = null
  private paging: Promise<void> | null = null
  private cursor: string | null = null
  private pages = 0
  private earlierChanged = false

  constructor(
    private readonly conversationId: string,
    private readonly onPatch: (patch: FeedPatch) => void,
    private readonly thumbnail: (image: ImageAttachment) => string,
    private readonly context: () => ToolContext,
    private readonly history: OpenCodeHistory,
  ) {
    this.builder = new OpenCodeFeedBuilder(thumbnail, Date.now, context)
  }

  get hasEarlier(): boolean {
    return this.cursor !== null
  }

  /** Сообщение ленты получило id у OpenCode (ответ на `prompt`). */
  noteOpenCodeId(feedId: string, openCodeId: string): void {
    this.openCodeIds.set(feedId, openCodeId)
  }

  /** id сообщения у OpenCode; у сообщения из журнала - тот же. */
  openCodeIdOf(feedId: string): string {
    return this.openCodeIds.get(feedId) ?? feedId
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
      tasks: [],
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

    const { upserts, removes } = this.builder.drain()
    const hasEarlier = this.earlierChanged ? this.hasEarlier : undefined

    this.earlierChanged = false

    if (upserts.length === 0 && removes.length === 0 && hasEarlier === undefined) return

    this.onPatch({ conversationId: this.conversationId, upserts, removes, hasEarlier })
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
   * Страница журнала - перед лентой; не прочиталась - лента начинается с того, что есть.
   * Страница начинается с начала хода: иначе ход разрезало бы на две страницы без строки хода.
   */
  private async readPage(cursor: string | null): Promise<void> {
    const sessionId = this.history.sessionId()

    if (!sessionId) return

    try {
      const page = await this.wholeTurns(sessionId, cursor)
      const fork = this.history.fork()
      const seam = fork?.at
        ? { inherited: fork.at, title: fork.sourceTitle, sourceSessionId: fork.sourceSessionId }
        : null

      this.pages += 1

      const replayed = replayMessages(
        page.messages,
        `p${this.pages}-`,
        this.thumbnail,
        this.context,
        seam,
        cursor === null,
      )

      this.builder.prepend(replayed.items)
      for (const [messageId, urls] of replayed.images) this.images.set(messageId, urls)
      this.cursor = page.cursor
      this.earlierChanged = true
    } catch (error) {
      console.warn('[opencode] журнал разговора не прочитался:', sessionId, error)
      this.cursor = null
    }
  }

  /** Страницы журнала подряд, пока самое раннее сообщение - середина хода, а журнал не кончился. */
  private async wholeTurns(sessionId: string, cursor: string | null): Promise<MessagesPage> {
    let page = await this.history.messages(sessionId, cursor)

    while (page.cursor && MID_TURN.has(String(page.messages[0]?.['type']))) {
      const earlier = await this.history.messages(sessionId, page.cursor)

      page = { messages: [...earlier.messages, ...page.messages], cursor: earlier.cursor }
    }

    return page
  }
}

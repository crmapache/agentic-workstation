import type { ForkOrigin, ImageAttachment } from '@shared/conversation'
import type { FeedItem, FeedPatch, ConversationFeed } from '@shared/conversation-feed'

import type { AcpAgent } from '../acp-agent'
import { AcpFeedBuilder } from '../feed/acp-feed-builder'
import { withForkSeam } from '../feed/acp-fork-seam'
import type { AgentFeed } from '../../agents/conversation/agent-parts'
import { FEED_FLUSH_MS } from '../../agents/conversation/conversation.constants'

/**
 * Лента разговора ACP для ядра (AgentFeed): сборщик и рассылка изменений окну пачками.
 * Прошлые ходы ACP отдаёт только повтором всей истории (`session/load`) - его делает
 * процесс-каталог панели, и лента встаёт целиком, страниц выше нет.
 */
export class AcpFeedSync implements AgentFeed {
  readonly builder: AcpFeedBuilder
  /** Картинки сообщений целиком (data URL) по id сообщения - окно открывает их по запросу. */
  readonly images = new Map<string, readonly string[]>()
  private flushTimer: NodeJS.Timeout | null = null
  private loading: Promise<void> | null = null

  constructor(
    private readonly conversationId: string,
    private readonly onPatch: (patch: FeedPatch) => void,
    thumbnail: (image: ImageAttachment) => string,
    agent: AcpAgent,
    servers: () => readonly string[],
    private readonly history: () => Promise<FeedItem[] | null> | null,
    private readonly fork: () => ForkOrigin | null = () => null,
  ) {
    this.builder = new AcpFeedBuilder(
      thumbnail,
      Date.now,
      (call, base) => agent.lens(servers())(call, base),
      agent.toolId,
    )
  }

  /** Прошлые ходы - один раз за жизнь разговора; новый разговор - сразу. */
  ensureLoaded(): Promise<void> {
    this.loading ??= this.readHistory()

    return this.loading
  }

  snapshot(): ConversationFeed {
    return {
      conversationId: this.conversationId,
      items: [...this.builder.items],
      tasks: [...this.builder.tasks],
      hasEarlier: false,
    }
  }

  async loadEarlier(): Promise<ConversationFeed> {
    await this.loading

    return this.snapshot()
  }

  async loadThrough(): Promise<ConversationFeed> {
    await this.loading

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

    const { upserts, removes, tasks } = this.builder.drain()

    if (upserts.length === 0 && removes.length === 0 && tasks === undefined) return

    this.onPatch({ conversationId: this.conversationId, upserts, removes, tasks })
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)

    this.flushTimer = null
  }

  /** Повтор истории - перед лентой; не прочитался - лента начинается с того, что есть. */
  private async readHistory(): Promise<void> {
    try {
      const items = await this.history()

      // Повтор не вышел (каталог упал, агент занят): лента прочитается в следующий раз.
      if (items === null) this.loading = null
      if (items && items.length > 0) this.builder.prepend(withForkSeam(items, this.fork()))
    } catch (error) {
      console.warn('[acp] прошлые ходы разговора не прочитались:', this.conversationId, error)
    }
  }
}

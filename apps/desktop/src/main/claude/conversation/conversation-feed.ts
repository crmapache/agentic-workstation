import { setImmediate as nextTick } from 'node:timers/promises'

import type { ForkOrigin, ImageAttachment } from '@shared/conversation'
import type { FeedItem, FeedPatch, ConversationFeed } from '@shared/conversation-feed'

import type { CliMessage } from '../cli/cli-messages'
import { stringField, parseCliLine } from '../cli/cli-messages'
import { FeedBuilder } from '../feed/feed-builder'
import { sourceLineOf, itemsFromLines } from '../feed/feed-lookup'
import { PAGE_MESSAGES, OPENING_PAGE_MESSAGES } from '../history/history.constants'
import {
  readTranscriptTail,
  readTranscriptUpTo,
  readTranscriptLines,
} from '../history/transcript-files'
import type { TranscriptPage } from '../history/transcript-pages'
import { lastPage, pageAnchor, pageBefore } from '../history/transcript-pages'
import { findTranscript } from '../history/transcript-paths'
import { dropRewound } from '../history/transcript-rewinds'
import { FEED_FLUSH_MS } from '../../agents/conversation/conversation.constants'
import { REPLAY_BATCH_LINES } from './conversation.constants'

/** Строки транскрипта для страниц выше: свой файл или источник нерождённого форка до точки. */
type ReadAll = () => Promise<string[]>

const messagesOf = (lines: readonly string[]) =>
  lines.map(parseCliLine).filter((message): message is CliMessage => message !== null)

/**
 * Лента одного разговора и её доставка окну. Транскрипт прошлых ходов читается один
 * раз - когда ленту впервые попросили или когда в разговор пишут, и с конца: лента
 * открывается последними сообщениями, ранние приходят страницами по просьбе окна.
 * Живые изменения уходят пачками раз в FEED_FLUSH_MS.
 */
export class ConversationFeedSync {
  readonly builder: FeedBuilder
  private loading: Promise<void> | null = null
  private paging: Promise<void> | null = null
  private flushTimer: NodeJS.Timeout | null = null
  /** Сколько миниатюр сделано: при чтении транскрипта после каждой - передышка. */
  private thumbnails = 0
  /** Выше загруженного в транскрипте есть ещё сообщения. */
  private hasEarlier = false
  /** Поменялось, есть ли что подгружать выше: окно узнает со следующей пачкой. */
  private earlierChanged = false
  /** uuid самой ранней загруженной строки: страница выше - строки перед ней. */
  private anchor: string | null = null
  private readAll: ReadAll | null = null
  private fork: ForkOrigin | null = null

  constructor(
    private readonly conversationId: string,
    private readonly onPatch: (patch: FeedPatch) => void,
    thumbnail: (image: ImageAttachment) => string,
  ) {
    this.builder = new FeedBuilder((image) => {
      this.thumbnails += 1

      return thumbnail(image)
    })
  }

  /**
   * Подгрузить прошлые ходы из транскрипта CLI, если он есть. Один раз за жизнь.
   * Форк, который ещё не родился, показывает источник до своей точки, а под ней шов.
   */
  ensureLoaded(projectPath: string, sessionId: string, fork: ForkOrigin | null): Promise<void> {
    this.loading ??= this.loadTranscript(projectPath, sessionId, fork)

    return this.loading
  }

  /** Лента целиком для окна. */
  snapshot(): ConversationFeed {
    return {
      conversationId: this.conversationId,
      items: [...this.builder.items],
      tasks: this.builder.tasks,
      hasEarlier: this.hasEarlier,
    }
  }

  /**
   * Страница выше загруженного («load earlier messages»): строки транскрипта перед самой
   * ранней в ленте встают перед лентой. Ответ - лента целиком: окно кладёт её в кэш.
   */
  async loadEarlier(): Promise<ConversationFeed> {
    await this.loading

    if (this.hasEarlier && this.readAll) await this.page(this.readAll, null)

    return this.snapshot()
  }

  /**
   * Страницы выше - до элемента itemId (прыжок к закреплённому выше загруженного): одним
   * чтением файла, а не страницей за страницей. Ответ - лента целиком; элемента в
   * транскрипте нет - встаёт обычная страница.
   */
  async loadThrough(itemId: string): Promise<ConversationFeed> {
    await this.loading
    // Идущая страница могла уже принести его - вторую тянуть незачем.
    await this.paging

    if (!this.has(itemId) && this.hasEarlier && this.readAll) {
      await this.page(this.readAll, itemId)
    }

    return this.snapshot()
  }

  /**
   * Элементы по id для полки закреплённых: загруженные - из ленты, что выше - прямо из
   * транскрипта, без страниц. Чего нет в ответе, нет и в разговоре (откат, /clear). null -
   * транскрипт не прочитался: тогда про отсутствующие ничего не известно. Файл читается и
   * при «выше ничего нет»: это знание из прочитанного на открытии, а открытие могло не
   * прочитать файл - снятые по нему закрепы пропали бы зря.
   */
  async itemsById(itemIds: readonly string[]): Promise<FeedItem[] | null> {
    await this.loading

    const loaded = this.builder.items.filter((item) => itemIds.includes(item.id))
    const above = itemIds.filter((id) => !loaded.some((item) => item.id === id))

    if (above.length === 0 || !this.readAll) return loaded

    try {
      return [...itemsFromLines(await this.readAll(), above), ...loaded]
    } catch (error) {
      console.warn('[claude] закреплённые не нашлись в транскрипте:', error)

      return null
    }
  }

  /** /clear: начался новый разговор - выше нечего подгружать. */
  forgetEarlier(): void {
    this.anchor = null
    this.readAll = null
    this.setEarlier(false)
  }

  /** Отправить окну накопившиеся изменения - не сразу, а пачкой. */
  schedule(): void {
    this.flushTimer ??= setTimeout(() => this.flush(), FEED_FLUSH_MS)
  }

  /** Отправить сейчас: перед концом хода окно должно увидеть всё до итога. */
  flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)

    this.flushTimer = null

    const { upserts, removes, tasks } = this.builder.drain()
    const hasEarlier = this.earlierChanged ? this.hasEarlier : undefined

    this.earlierChanged = false

    if (upserts.length > 0 || removes.length > 0 || tasks || hasEarlier !== undefined) {
      this.onPatch({ conversationId: this.conversationId, upserts, removes, tasks, hasEarlier })
    }
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)

    this.flushTimer = null
  }

  /**
   * Прошлые ходы из транскрипта - последняя страница. Разбор - пачками с передышкой:
   * длинный транскрипт - это десятки мегабайт, и главный процесс не должен замирать.
   * Миниатюра картинки (декод и уменьшение скриншота) - дорогая, после каждой передышка
   * своя. Окну ничего не шлётся: ленту целиком отдаёт getFeed.
   */
  private async loadTranscript(projectPath: string, sessionId: string, fork: ForkOrigin | null) {
    const own = await findTranscript(projectPath, sessionId)
    const source = !own && fork ? await findTranscript(projectPath, fork.sourceSessionId) : null
    let seamPlaced = false

    this.fork = fork

    try {
      const page = await this.openingPage(own, source, fork)

      this.hasEarlier = page.hasEarlier
      this.anchor = pageAnchor(page.lines)

      for (const [index, line] of page.lines.entries()) {
        const message = parseCliLine(line)
        const thumbnailsBefore = this.thumbnails

        if (message) this.builder.apply(message, true)

        // Унаследованное кончается на строке форка: ниже - сказанное в самом форке.
        if (fork && message && stringField(message, 'uuid') === fork.at) {
          this.builder.addNotice('forked', fork.sourceTitle, {
            sourceSessionId: fork.sourceSessionId,
          })
          // Резать по сообщению не вышло: под швом - что форк несёт разговор целиком.
          if (fork.whole) this.builder.addNotice('fork-whole')
          seamPlaced = true
        }

        const isBatchEnd = index % REPLAY_BATCH_LINES === REPLAY_BATCH_LINES - 1

        if (isBatchEnd || this.thumbnails !== thumbnailsBefore) await nextTick()
      }
    } catch (error) {
      console.warn('[claude] транскрипт не прочитался:', own ?? source, error)
    }

    this.builder.finishReplay()

    if (fork && !own && !seamPlaced) {
      this.builder.addNotice('forked', fork.sourceTitle, { sourceSessionId: fork.sourceSessionId })
      if (fork.whole) this.builder.addNotice('fork-whole')
    }

    this.builder.drain()
  }

  /** Последняя страница: своего файла - с конца, нерождённого форка - источник до точки. */
  private async openingPage(
    own: string | null,
    source: string | null,
    fork: ForkOrigin | null,
  ): Promise<TranscriptPage> {
    if (own) {
      const tail = await readTranscriptTail(own)

      this.readAll = () => readTranscriptLines(own)

      return lastPage(dropRewound(tail.lines), OPENING_PAGE_MESSAGES, tail.complete)
    }

    if (source && fork) {
      this.readAll = () => readTranscriptUpTo(source, fork.at)

      return lastPage(await this.readAll(), OPENING_PAGE_MESSAGES, true)
    }

    return { lines: [], hasEarlier: false }
  }

  private has(itemId: string): boolean {
    return this.builder.items.some((item) => item.id === itemId)
  }

  /** Одна страница за раз: просьба, пока страница едет, получает её же, а не вторую. */
  private async page(readAll: ReadAll, through: string | null) {
    this.paging ??= this.readPage(readAll, through).finally(() => {
      this.paging = null
    })
    await this.paging
  }

  /**
   * Страница перед якорем; through - id элемента, до которого она тянется (прыжок к
   * закреплённому). Якоря в файле больше нет (его отрезал откат) - последняя страница
   * файла: то, что уже в ленте, второй раз не встанет (те же id).
   */
  private async readPage(readAll: ReadAll, through: string | null) {
    const lines = await readAll()
    const target = through === null ? -1 : sourceLineOf(lines, through)
    const page =
      (this.anchor ? pageBefore(lines, this.anchor, PAGE_MESSAGES, target) : null) ??
      lastPage(lines, PAGE_MESSAGES, true)
    const fork = this.fork

    this.builder.prependReplay(
      messagesOf(page.lines),
      fork
        ? {
            at: fork.at,
            title: fork.sourceTitle,
            sourceSessionId: fork.sourceSessionId,
            whole: fork.whole === true,
          }
        : null,
    )
    this.anchor = pageAnchor(page.lines) ?? this.anchor
    this.hasEarlier = page.hasEarlier && page.lines.length > 0
  }

  private setEarlier(value: boolean) {
    if (this.hasEarlier === value) return

    this.hasEarlier = value
    this.earlierChanged = true
  }
}

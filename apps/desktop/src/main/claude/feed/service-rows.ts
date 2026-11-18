import type { NoticeCode, RetryReason, RetryOutcome, CompactFeedItem } from '@shared/claude-feed'

import type { CliMessage } from '../cli/cli-messages'
import { isRecord, numberField, recordField, stringField } from '../cli/cli-messages'
import type { FeedStore } from '../../agents/feed/feed-store'
import {
  RETRY_TRACE_MS,
  ALLOWED_RATE_LIMIT,
  FAST_QUIET_REASONS,
  MODEL_FALLBACK_SUBTYPES,
} from './feed.constants'

/** Что служебным строкам нужно от сборщика: лента, новые id и обычная отметка. */
export type ServiceRowsHost = {
  store: FeedStore
  nextId: (prefix: string) => string
  addNotice: (code: NoticeCode, detail: string) => void
}

const retryReason = (status: number): RetryReason => {
  if (status === 429) return 'rateLimited'
  if (status === 529) return 'overloaded'
  if (status === 401 || status === 403) return 'auth'

  return 'error'
}

/** Модель настоящая, а не служебная метка CLI вроде «<synthetic>». */
const realModel = (model: string): string => (model && !model.startsWith('<') ? model : '')

/** Цифры компакта: в потоке snake_case, в транскрипте - camelCase. */
const compactFigures = (message: CliMessage) => {
  const meta = isRecord(message['compact_metadata'])
    ? message['compact_metadata']
    : recordField(message, 'compactMetadata')
  const trigger: CompactFeedItem['trigger'] =
    stringField(meta, 'trigger') === 'manual'
      ? 'manual'
      : stringField(meta, 'trigger') === 'auto'
        ? 'auto'
        : null
  const pick = (snake: string, camel: string) =>
    numberField(meta, snake) || numberField(meta, camel)

  return {
    trigger,
    preTokens: pick('pre_tokens', 'preTokens'),
    postTokens: pick('post_tokens', 'postTokens'),
    durationMs: pick('duration_ms', 'durationMs'),
  }
}

/**
 * Служебные строки ленты, как в ACC: сжатие контекста вживую и его итог (CONTEXT),
 * повтор запроса к API (RETRY), смена модели самим CLI (MODEL), лимит подписки (LIMIT),
 * быстрый режим, который не включился (FAST). Чистая логика над лентой.
 */
export class ServiceRows {
  /** Идущий компакт: его карточка закроется границей компакта. */
  private compactId: string | null = null
  private retry: { id: string; startedAt: number } | null = null
  /** Причина, по которой быстрый режим уже назван отказавшим: повтор - не новость. */
  private fastNoted = ''
  /** Имена, которыми строка SETTINGS уже сказала о перебитом аккаунте. */
  private outranked = ''

  constructor(private readonly host: ServiceRowsHost) {}

  /** Строка `system` основного потока; true - она служебная и разобрана здесь. */
  applySystem(message: CliMessage, at: number): boolean {
    if (message['task_id'] !== undefined) return false

    const { subtype } = message

    if (subtype === 'api_retry') return this.applyRetry(message, at)
    if (subtype && MODEL_FALLBACK_SUBTYPES.has(subtype)) return this.applyFallback(message)
    if (subtype === 'compact_boundary') return this.finishCompact(message, at)

    if (message['compact_result'] !== undefined) {
      this.dropCompact()

      const error = stringField(message, 'compact_error')

      if (stringField(message, 'compact_result') === 'failed' && error) {
        this.host.addNotice('cli-error', error)
      }

      return true
    }

    if (message['status'] === 'compacting' && !this.compactId) {
      this.compactId = this.host.nextId('compact')
      this.host.store.put({
        kind: 'compact',
        id: this.compactId,
        parentToolUseId: null,
        pending: true,
        startedAt: at,
        trigger: null,
        preTokens: 0,
        postTokens: 0,
        durationMs: 0,
      })

      return true
    }

    return false
  }

  /**
   * Любая строка после повторов говорит, чем они кончились: ответ модели - прошёл (если
   * не служебная заглушка CLI), итог хода - по его ошибке. Повтор, прошедший быстрее
   * RETRY_TRACE_MS, следа не оставляет: это была заминка, а не событие.
   */
  closeRetryFor(message: CliMessage, at: number): void {
    if (!this.retry || message.type === 'system' || message.type === 'rate_limit_event') return
    if (message.type === 'stream_event' || message.type === 'user')
      return this.closeRetry('recovered', at)

    if (message.type === 'assistant') {
      const model = stringField(recordField(message, 'message'), 'model')

      return this.closeRetry(model.startsWith('<') ? 'failed' : 'recovered', at)
    }

    if (message.type === 'result') {
      this.closeRetry(message['is_error'] === true ? 'failed' : 'recovered', at)
    }
  }

  /** Повторы закрываются без ответа: человек остановил ход или процесс умер. */
  closeRetry(outcome: RetryOutcome, at: number): void {
    const retry = this.retry

    if (!retry) return

    this.retry = null

    const elapsed = Math.max(0, at - retry.startedAt)

    if (outcome === 'recovered' && elapsed < RETRY_TRACE_MS) {
      this.host.store.removeOne(retry.id)

      return
    }

    this.host.store.update(retry.id, 'retry', (item) => ({
      ...item,
      pending: false,
      outcome,
      durationMs: elapsed,
    }))
  }

  /**
   * Событие лимита подписки. Приходит и в обычной жизни («пропущено»), поэтому строка -
   * только на исчерпанный лимит или на работу за доплату, и одна на состояние и окно:
   * CLI повторяет событие на каждом ходу, пока состояние держится.
   */
  applyRateLimit(message: CliMessage, at: number): void {
    const info = recordField(message, 'rate_limit_info')
    const status = stringField(info, 'status').toLowerCase()

    if (!status || ALLOWED_RATE_LIMIT.has(status)) return

    const resetsAt = numberField(info, 'resetsAt') * 1000
    const isExtra = info['isUsingOverage'] === true || info['overageInUse'] === true

    if (!isExtra && (info['rateLimitGraceActive'] === true || (resetsAt && resetsAt <= at))) return

    const state = isExtra ? 'extra' : 'limit'
    const last = this.host.store.items.findLast((item) => item.kind === 'limit')

    if (last?.kind === 'limit' && last.state === state && last.resetsAt === resetsAt) return

    this.host.store.put({
      kind: 'limit',
      id: this.host.nextId('limit'),
      parentToolUseId: null,
      state,
      window: stringField(info, 'rateLimitType'),
      resetsAt,
    })
  }

  /**
   * Быстрый режим: CLI говорит о нём в init и в итоге хода. Отказ с настоящей причиной -
   * строка FAST; «не просили» и «проверяется» - не отказ. Снова заработал - следующий
   * отказ по той же причине опять новость.
   */
  noteFast(message: CliMessage): void {
    const state = stringField(message, 'fast_mode_state')

    if (!state) return
    if (state === 'on') {
      this.fastNoted = ''

      return
    }

    const reason = stringField(message, 'fast_mode_disabled_reason')

    if (state !== 'off' || !reason || FAST_QUIET_REASONS.has(reason) || reason === this.fastNoted) {
      return
    }

    this.fastNoted = reason
    this.host.addNotice('fast', reason)
  }

  /**
   * Репозиторий перебивает выбранный аккаунт (SETTINGS, как в ACC): раз на разговор, но
   * заново на новый набор имён - процесс поднимается снова после сна, падения, переезда.
   */
  noteOutranked(names: readonly string[]): void {
    const said = names.join(', ')

    if (!said || said === this.outranked) return

    this.outranked = said
    this.host.addNotice('outranked', said)
  }

  /** Быстрый режим попросили заново: прошлый отказ говорил о прошлой просьбе. */
  fastAsked(): void {
    this.fastNoted = ''
  }

  /** Разговор стёрт (/clear) или обрезан: идущий компакт и повторы больше не закроются. */
  reset(): void {
    this.compactId = null
    this.retry = null
  }

  private applyRetry(message: CliMessage, at: number) {
    const fields = {
      reason: retryReason(numberField(message, 'error_status')),
      attempt: numberField(message, 'attempt') || 1,
      maxRetries: numberField(message, 'max_retries'),
      retryAt: at + Math.max(0, numberField(message, 'retry_delay_ms')),
    }

    if (this.retry) {
      this.host.store.update(this.retry.id, 'retry', (item) => ({ ...item, ...fields }))

      return true
    }

    this.retry = { id: this.host.nextId('retry'), startedAt: at }
    this.host.store.put({
      kind: 'retry',
      id: this.retry.id,
      parentToolUseId: null,
      pending: true,
      startedAt: at,
      outcome: null,
      durationMs: 0,
      ...fields,
    })

    return true
  }

  private applyFallback(message: CliMessage) {
    const to = realModel(stringField(message, 'fallbackModel'))
    const from = realModel(stringField(message, 'originalModel'))

    if (to && from && from !== to) {
      this.host.store.put({
        kind: 'model',
        id: this.host.nextId('model'),
        parentToolUseId: null,
        from,
        to,
        reason: stringField(message, 'content').trim(),
      })
    }

    return true
  }

  private finishCompact(message: CliMessage, at: number) {
    const figures = compactFigures(message)
    const pending = this.compactId ? this.host.store.get(this.compactId) : undefined

    this.compactId = null

    if (pending?.kind === 'compact') {
      this.host.store.put({ ...pending, ...figures, pending: false })

      return true
    }

    this.host.store.put({
      kind: 'compact',
      id: this.host.nextId('compact'),
      parentToolUseId: null,
      pending: false,
      startedAt: at,
      ...figures,
    })

    return true
  }

  private dropCompact() {
    if (this.compactId) this.host.store.removeOne(this.compactId)

    this.compactId = null
  }
}

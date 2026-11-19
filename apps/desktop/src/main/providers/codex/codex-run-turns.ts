import { jsonOf } from '../run-stream/ask-once'
import type { StreamUsage } from '../run-stream/claude-stream'
import {
  addUsage,
  NO_USAGE,
  textDelta,
  streamInit,
  turnEnding,
  turnResult,
  textStarted,
  limitReached,
  assistantText,
  rateLimitEvent,
} from '../run-stream/claude-stream'
import type { JournalSpeaker } from '../run-stream/run-journal'
import type { CliMessage } from '../../claude/cli/cli-messages'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

const count = (record: Record<string, unknown>, key: string): number => {
  const value = record[key]

  return typeof value === 'number' ? value : 0
}

/** Ошибки хода Codex, которые значат «лимит аккаунта»: прогону - искать другой аккаунт. */
const LIMIT_ERRORS = new Set(['usageLimitExceeded', 'rateLimitExceeded'])

/** Лимит упёрся, а когда откроется - Codex не сказал: движок попробует снова через столько. */
const UNKNOWN_RESET_MS = 15 * 60 * 1000

/**
 * Расход вызова модели Codex словами Claude: `cachedInputTokens` у Codex - часть входа, а у
 * Claude чтение кеша идёт отдельно от входа.
 */
const usageOf = (last: Record<string, unknown>): StreamUsage => {
  const cached = count(last, 'cachedInputTokens')

  return {
    input: Math.max(0, count(last, 'inputTokens') - cached),
    output: count(last, 'outputTokens'),
    cacheRead: cached,
    cacheWrite: count(last, 'cacheWriteInputTokens'),
  }
}

/** Что сделал элемент хода - строкой журнала сессии (голова читает его при перехвате). */
const journalLineOf = (item: Record<string, unknown>): [JournalSpeaker, string] | null => {
  switch (item['type']) {
    case 'agentMessage':
      return ['model', text(item, 'text')]
    case 'commandExecution': {
      const exit = item['exitCode']

      return [
        'tool',
        `$ ${text(item, 'command')}${typeof exit === 'number' ? ` (exit ${exit})` : ''}`,
      ]
    }
    case 'fileChange': {
      const changes = Array.isArray(item['changes']) ? item['changes'].filter(isRecord) : []

      return ['tool', `edited: ${changes.map((change) => text(change, 'path')).join(', ')}`]
    }
    case 'mcpToolCall':
      return ['tool', `${text(item, 'server')}.${text(item, 'tool')}`]
    default:
      return null
  }
}

/** Куда переводчик отдаёт сказанное: движку - поток, журналу сессии - строки. */
export type CodexTurnSink = {
  emit: (message: CliMessage) => void
  note: (who: JournalSpeaker, said: string) => void
}

/**
 * Ход Codex - ходом Claude для движка сценариев (docs/plan-providers/50-ide.md): начало хода
 * - `system/init`, ответ модели - живыми кусками и сообщением целиком, конец хода - концовка
 * последнего ответа и `result` с расходом; ход, упёршийся в лимит аккаунта, - отметка лимита
 * с окном и итог с ошибкой. Цены у Codex нет: подписка, а не плата за токены.
 */
export class CodexTurnTranslator {
  turnId = ''
  private turns = 0
  private usage: StreamUsage = NO_USAGE
  private lastText = ''
  private speaking = ''
  /** Когда откроется исчерпанное окно лимита (мс эпохи); 0 - не знаем. */
  private resetsAt = 0
  private limitKind = 'codex'

  constructor(
    private readonly engineId: string,
    private readonly sink: CodexTurnSink,
    /** Ход отвечает по схеме: итог несёт JSON последнего ответа. */
    private readonly structured = false,
  ) {}

  /** Ход идёт: сообщение движка посреди него - доставка в ход, а не новый ход. */
  get isOpen(): boolean {
    return this.turnId !== ''
  }

  /** Уведомление сервера; не своё - мимо. */
  notify(method: string, params: Record<string, unknown>): void {
    switch (method) {
      case 'turn/started': {
        const turn = isRecord(params['turn']) ? params['turn'] : {}

        this.turnId = text(turn, 'id') || 'turn'
        this.sink.emit(streamInit(this.engineId))

        return
      }
      case 'item/agentMessage/delta': {
        const itemId = text(params, 'itemId')

        if (itemId !== this.speaking) {
          this.speaking = itemId
          this.sink.emit(textStarted())
        }

        this.sink.emit(textDelta(text(params, 'delta')))

        return
      }
      case 'item/completed':
        if (isRecord(params['item'])) this.itemDone(params['item'])

        return
      case 'thread/tokenUsage/updated': {
        const usage = isRecord(params['tokenUsage']) ? params['tokenUsage'] : {}

        if (isRecord(usage['last'])) this.usage = addUsage(this.usage, usageOf(usage['last']))

        return
      }
      case 'account/rateLimits/updated':
        this.limitsSeen(isRecord(params['rateLimits']) ? params['rateLimits'] : {})

        return
      case 'turn/completed':
        this.turnDone(isRecord(params['turn']) ? params['turn'] : {})

        return
      default:
        return
    }
  }

  /** Ход не начался (сервер отказал в `turn/start`): движку - итог с ошибкой. */
  failedToStart(message: string): void {
    this.sink.emit(streamInit(this.engineId))
    this.sink.note('error', message)
    this.finish(message, true)
  }

  private itemDone(item: Record<string, unknown>) {
    const line = journalLineOf(item)

    if (line) this.sink.note(line[0], line[0] === 'model' ? this.shown(line[1]) : line[1])
    if (item['type'] !== 'agentMessage') return

    const said = text(item, 'text')

    this.lastText = said
    this.speaking = ''
    this.sink.emit(assistantText(text(item, 'id'), this.shown(said)))
  }

  /** Ответ по схеме - человеку его слова (поле message), а не JSON целиком. */
  private shown(said: string): string {
    const answer = this.structured ? jsonOf(said) : null

    return isRecord(answer) && typeof answer['message'] === 'string' ? answer['message'] : said
  }

  /** Окна лимита из `account/rateLimits/updated`: исчерпанное - когда откроется. */
  private limitsSeen(limits: Record<string, unknown>) {
    const windows = [limits['primary'], limits['secondary']].filter(isRecord)
    const full = windows.filter((window) => count(window, 'usedPercent') >= 100)
    const resets = full.map((window) => count(window, 'resetsAt') * 1000).filter((at) => at > 0)

    this.resetsAt = resets.length > 0 ? Math.max(...resets) : 0
    this.limitKind = text(limits, 'limitId') || 'codex'
  }

  private turnDone(turn: Record<string, unknown>) {
    const status = text(turn, 'status')
    const error = isRecord(turn['error']) ? turn['error'] : null
    const info = error?.['codexErrorInfo']

    if (status === 'completed') {
      if (this.lastText) this.sink.emit(turnEnding())

      return this.finish(this.lastText, false)
    }

    if (typeof info === 'string' && LIMIT_ERRORS.has(info)) {
      const resetsAt = this.resetsAt || Date.now() + UNKNOWN_RESET_MS

      this.sink.emit(rateLimitEvent(Math.round(resetsAt / 1000), this.limitKind))
      this.sink.emit(limitReached())
    }

    const message = error ? text(error, 'message') : ''

    this.sink.note('error', message || status)
    this.finish(message, true)
  }

  private finish(said: string, isError: boolean) {
    this.turns += 1
    this.sink.emit(
      turnResult({
        text: said,
        isError,
        turns: this.turns,
        usage: this.usage,
        ...(this.structured && !isError && { structured: jsonOf(said) }),
      }),
    )
    this.turnId = ''
    this.usage = NO_USAGE
    this.lastText = ''
    this.speaking = ''
  }
}

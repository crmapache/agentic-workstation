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
  assistantText,
  backgroundTasks,
} from '../run-stream/claude-stream'
import type { JournalSpeaker } from '../run-stream/run-journal'
import type { CliMessage } from '../../claude/cli/cli-messages'
import type { OpenCodeEvent } from '../../opencode/server/opencode-server'

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

/** Короткий вход вызова для журнала: команда, путь, адрес - или JSON до сотни знаков. */
const inputLine = (input: Record<string, unknown>): string =>
  text(input, 'command') ||
  text(input, 'path') ||
  text(input, 'filePath') ||
  text(input, 'url') ||
  JSON.stringify(input).slice(0, 100)

/** Куда переводчик отдаёт сказанное: движку - поток, журналу сессии - строки. */
export type OpenCodeTurnSink = {
  emit: (message: CliMessage) => void
  note: (who: JournalSpeaker, said: string) => void
}

/**
 * Ход OpenCode - ходом Claude для движка сценариев (docs/plan-providers/50-ide.md): начало
 * исполнения сессии - `system/init`, текст - кусками и целиком по сообщению модели, конец
 * исполнения - концовка последнего сообщения и `result` с расходом и ценой (OpenCode считает
 * её сам; у локальных моделей - ноль). Субагенты OpenCode 2.3.2 работают в фоне - для движка
 * это фоновые помощники карточки.
 */
export class OpenCodeTurnTranslator {
  private open = false
  private turns = 0
  private usage: StreamUsage = NO_USAGE
  private cost = 0
  /** Последнее сообщение модели и его текст: ответ хода. */
  private message = ''
  private said = ''
  private speaking = ''
  private readonly helpers = new Set<string>()

  constructor(
    private readonly engineId: string,
    private readonly sink: OpenCodeTurnSink,
    /** Ход отвечает по схеме: итог несёт JSON последнего ответа. */
    private readonly structured = false,
  ) {}

  get isOpen(): boolean {
    return this.open
  }

  /** Событие своей сессии. */
  own(event: OpenCodeEvent): void {
    const { data } = event

    switch (event.type) {
      case 'session.execution.started':
        this.open = true
        this.sink.emit(streamInit(this.engineId))

        return
      case 'session.text.delta': {
        const key = `${text(data, 'assistantMessageID')}:${count(data, 'ordinal')}`

        if (key !== this.speaking) {
          this.speaking = key
          this.sink.emit(textStarted())
        }

        this.sink.emit(textDelta(text(data, 'delta')))

        return
      }
      case 'session.text.ended':
        this.textEnded(text(data, 'assistantMessageID'), text(data, 'text'))

        return
      case 'session.tool.called':
        this.sink.note(
          'tool',
          `${text(data, 'name')} ${inputLine(isRecord(data['input']) ? data['input'] : {})}`,
        )

        return
      case 'session.step.ended':
        this.stepEnded(data)

        return
      case 'session.execution.succeeded':
      case 'session.execution.failed':
      case 'session.execution.interrupted':
        this.executionEnded(event.type, data)

        return
      default:
        return
    }
  }

  /** Субагент начал или кончил свой ход: набор фоновых помощников движку. */
  helper(childId: string, running: boolean): void {
    const had = this.helpers.has(childId)

    if (running) this.helpers.add(childId)
    else this.helpers.delete(childId)

    if (had !== running) this.sink.emit(backgroundTasks([...this.helpers]))
  }

  /** Ход не начался (сервер отказал в сообщении): движку - итог с ошибкой. */
  failedToStart(message: string): void {
    this.sink.emit(streamInit(this.engineId))
    this.sink.note('error', message)
    this.finish(message, true)
  }

  private textEnded(messageId: string, said: string) {
    if (!said.trim()) return

    // Новое сообщение модели - новый ответ; части одного сообщения - один текст.
    this.said = messageId === this.message && this.said ? `${this.said}\n\n${said}` : said
    this.message = messageId
    this.speaking = ''
    // Ответ по схеме - человеку его слова (поле message), а не JSON целиком.
    const answer = this.structured ? jsonOf(said) : null
    const shown =
      isRecord(answer) && typeof answer['message'] === 'string' ? answer['message'] : said

    this.sink.emit(assistantText(messageId, shown))
    this.sink.note('model', shown)
  }

  /** Расход шага модели словами Claude: размышление - часть вывода, как у Claude. */
  private stepEnded(data: Record<string, unknown>) {
    const tokens = isRecord(data['tokens']) ? data['tokens'] : {}
    const cache = isRecord(tokens['cache']) ? tokens['cache'] : {}

    this.usage = addUsage(this.usage, {
      input: count(tokens, 'input'),
      output: count(tokens, 'output') + count(tokens, 'reasoning'),
      cacheRead: count(cache, 'read'),
      cacheWrite: count(cache, 'write'),
    })
    this.cost += count(data, 'cost')
  }

  private executionEnded(type: string, data: Record<string, unknown>) {
    if (type === 'session.execution.succeeded') {
      if (this.said) this.sink.emit(turnEnding())

      return this.finish(this.said, false)
    }

    const error = isRecord(data['error']) ? text(data['error'], 'message') : text(data, 'error')

    this.sink.note('error', error || type)
    this.finish(error, true)
  }

  private finish(said: string, isError: boolean) {
    this.turns += 1
    this.sink.emit(
      turnResult({
        text: said,
        isError,
        turns: this.turns,
        usage: this.usage,
        costUsd: this.cost,
        ...(this.structured && !isError && { structured: jsonOf(said) }),
      }),
    )
    this.open = false
    this.usage = NO_USAGE
    this.message = ''
    this.said = ''
    this.speaking = ''
  }
}

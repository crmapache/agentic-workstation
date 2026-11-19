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
} from '../run-stream/claude-stream'
import type { JournalSpeaker } from '../run-stream/run-journal'
import type { AcpTurnUsage, AcpPromptResult, AcpSessionUpdate } from '../../acp/protocol/acp-types'
import type { CliMessage } from '../../claude/cli/cli-messages'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Куда переводчик отдаёт сказанное: движку - поток, журналу сессии - строки. */
export type AcpTurnSink = {
  emit: (message: CliMessage) => void
  note: (who: JournalSpeaker, said: string) => void
}

/**
 * Расход хода словами Claude. Схема ACP v1 его не знает: `agy` отдаёт `usage` в ответе на ход,
 * Kimi - нет (ADR 0092), тогда нули - честнее, чем догадка. Размышление - часть вывода.
 */
const usageOf = (usage: AcpTurnUsage | undefined): StreamUsage => ({
  input: usage?.inputTokens ?? 0,
  output: (usage?.outputTokens ?? 0) + (usage?.thoughtTokens ?? 0),
  cacheRead: usage?.cachedReadTokens ?? 0,
  cacheWrite: usage?.cachedWriteTokens ?? 0,
})

/** Почему ход кончился не ответом - словами для итога; отмена - без слов, как у Codex. */
const stopWords = (stopReason: string): string => {
  switch (stopReason) {
    case 'cancelled':
      return ''
    case 'refusal':
      return 'The model refused to answer.'
    case 'max_tokens':
      return 'The answer hit the output limit of the model.'
    default:
      return `The turn stopped: ${stopReason}.`
  }
}

/**
 * Ход ACP - ходом Claude для движка сценариев (ADR 0085, 0092): сообщение прогона -
 * `system/init`, ответ модели - кусками и целиком по сообщению, конец хода (ответ на
 * `session/prompt`) - концовка и `result` с расходом. У ACP нет id сообщения: куски ответа
 * подряд - одно сообщение, вызов инструмента начинает следующее; ответ хода - последнее.
 * Цены ACP не называет - итог без неё.
 */
export class AcpTurnTranslator {
  private open = false
  private turns = 0
  private usage: StreamUsage = NO_USAGE
  /** Сообщений модели за жизнь процесса: id сообщения для движка. */
  private messages = 0
  /** Растущее сообщение модели и последнее законченное - ответ хода. */
  private speaking = ''
  private said = ''

  constructor(
    private readonly engineId: string,
    private readonly sink: AcpTurnSink,
    /** Ход отвечает по схеме: итог несёт JSON последнего ответа. */
    private readonly structured = false,
  ) {}

  get isOpen(): boolean {
    return this.open
  }

  /** Ход пошёл: сообщение ушло агенту. */
  started(): void {
    this.open = true
    this.sink.emit(streamInit(this.engineId))
  }

  /** Обновление своей сессии посреди хода: ответ модели кусками, вызов закрывает сообщение. */
  update(update: AcpSessionUpdate): void {
    if (!this.open) return

    if (update.sessionUpdate === 'agent_message_chunk') {
      const delta = update.content.type === 'text' ? update.content.text : ''

      if (!delta) return
      if (!this.speaking) this.sink.emit(textStarted())

      this.speaking += delta
      this.sink.emit(textDelta(delta))

      return
    }

    if (update.sessionUpdate === 'tool_call') this.closeMessage()
  }

  /** Ответ агента на ход: причина остановки (и расход, если агент его дал). */
  ended(result: AcpPromptResult): void {
    this.closeMessage()
    this.usage = addUsage(this.usage, usageOf(result.usage))

    if (result.stopReason === 'end_turn') {
      if (this.said) this.sink.emit(turnEnding())

      return this.finish(this.said, false)
    }

    this.sink.note('error', result.stopReason)
    this.finish(stopWords(result.stopReason), true)
  }

  /** Ход не дошёл до ответа: агент отказал на сообщение (вход истёк, сбой). */
  failed(message: string): void {
    if (!this.open) this.started()

    this.closeMessage()
    this.sink.note('error', message)
    this.finish(message, true)
  }

  /** Сообщение модели кончилось: движку - целиком, журналу - строкой. */
  private closeMessage() {
    const said = this.speaking

    this.speaking = ''

    if (!said.trim()) return

    this.messages += 1
    this.said = said

    // Ответ по схеме - человеку его слова (поле message), а не JSON целиком.
    const answer = this.structured ? jsonOf(said) : null
    const shown =
      isRecord(answer) && typeof answer['message'] === 'string' ? answer['message'] : said

    this.sink.emit(assistantText(`${this.engineId}-m${this.messages}`, shown))
    this.sink.note('model', shown)
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
    this.open = false
    this.usage = NO_USAGE
    this.speaking = ''
    this.said = ''
  }
}

import { randomUUID } from 'node:crypto'

import type { AsideView, AsideThread, AsideExchange } from '@shared/claude-panel'

import type { CliMessage } from '../cli/cli-messages'
import type { CliProcess } from '../cli/cli-process'
import { CliReplyError } from '../cli/cli-process'
import type { ConversationRuntime } from '../conversation/conversation-runtime'
import { ASIDE_TIMEOUT_MS } from './panel.constants'
import type { AsideEnding } from './side-question'
import {
  answerOf,
  failureOf,
  withAsked,
  withRetry,
  progressOf,
  withEnding,
  sideHistory,
  sideRequest,
} from './side-question'

const EMPTY: AsideThread = { open: false, exchanges: [] }

/** Вопрос в пути: пока процесс поднимается, process пуст - отмена в это время не ждёт CLI. */
type Ask = {
  conversationId: string
  process: CliProcess | null
  timer: NodeJS.Timeout | null
}

/**
 * Вопросы сбоку (/btw) всех вкладок: служебный запрос `side_question` живому процессу
 * разговора - посреди хода ход идёт дальше, спящая вкладка поднимается (ответ берётся
 * из контекста процесса). Цепочка - в памяти, по вкладке: в транскрипт CLI её не пишет,
 * агент её не видит, перезапуск она не переживает. Каждое изменение - событием окну.
 */
export class AsideDesk {
  /** Слушатель изменений цепочек: окну - событием claudePanel:aside. */
  onChange: (view: AsideView) => void = () => undefined
  private readonly threads = new Map<string, AsideThread>()
  private readonly asks = new Map<string, Ask>()
  /** Кто ждёт итога вопроса (телефон через Remote Control): по id вопроса. */
  private readonly waiters = new Map<string, (exchange: AsideExchange | null) => void>()

  constructor(private readonly runtimeOf: (conversationId: string) => ConversationRuntime) {}

  thread(conversationId: string): AsideThread {
    return this.threads.get(conversationId) ?? EMPTY
  }

  /** Показать или закрыть карточку: закрыть - не забыть. */
  show(conversationId: string, open: boolean): AsideThread {
    const thread = this.thread(conversationId)

    if (thread.open !== open) this.put(conversationId, { ...thread, open })

    return this.thread(conversationId)
  }

  /**
   * Спросить сбоку. Пустой вопрос - открыть цепочку (голый /btw); replaces - тот же
   * вопрос заново, на месте того, что кончился без ответа.
   */
  ask(conversationId: string, question: string, replaces: string | null): AsideThread {
    const text = question.trim()

    if (!text) return this.show(conversationId, true)

    const runtime = this.runtimeOf(conversationId)
    const thread = this.thread(conversationId)
    const id = randomUUID()
    const history = sideHistory(thread, replaces)
    const asked = {
      id,
      question: text,
      askedAt: Date.now(),
      state: 'asking' as const,
      text: '',
      notice: '',
      failure: null,
      message: '',
      retry: null,
    }

    this.put(conversationId, withAsked(thread, asked, replaces))
    this.asks.set(id, { conversationId, process: null, timer: null })
    void this.run(runtime, id, sideRequest(text, history))

    return this.thread(conversationId)
  }

  /**
   * Вопрос сбоку с телефона (Remote Control, ADR 0041): id называет он сам - по нему отмена, - и
   * ждёт он итога вопроса, а не события окна. Карточку на столе не открывает: за Mac могут
   * работать с этой вкладкой, а спросил не человек за столом. Цепочка та же, что у окна: ответы
   * едут контекстом в следующие вопросы. null - вопрос с таким id уже есть: второго не будет.
   */
  askFor(conversationId: string, question: string, id: string): Promise<AsideExchange | null> {
    const text = question.trim()
    const thread = this.thread(conversationId)

    if (!text || this.asks.has(id) || this.exchangeOf(conversationId, id)) {
      return Promise.resolve(null)
    }

    const runtime = this.runtimeOf(conversationId)
    const asked = {
      id,
      question: text,
      askedAt: Date.now(),
      state: 'asking' as const,
      text: '',
      notice: '',
      failure: null,
      message: '',
      retry: null,
    }
    // Цепочку сняли раньше ответа (/clear) - вопроса больше нет: для спросившего это отмена.
    const answer = new Promise<AsideExchange>((resolve) =>
      this.waiters.set(id, (exchange) => resolve(exchange ?? { ...asked, state: 'cancelled' })),
    )

    this.put(conversationId, { ...withAsked(thread, asked, null), open: thread.open })
    this.asks.set(id, { conversationId, process: null, timer: null })
    void this.run(runtime, id, sideRequest(text, sideHistory(thread, null)))

    return answer
  }

  /** Отменить вопрос в пути: CLI ответит ошибкой «отменено», она и закончит его. */
  cancel(conversationId: string, askId: string): AsideThread {
    const ask = this.asks.get(askId)

    if (ask?.conversationId !== conversationId) {
      this.end(conversationId, askId, { state: 'cancelled' })
    } else if (ask.process) {
      ask.process.cancelControl(askId)
    } else {
      // Процесс ещё поднимается: вопрос не уйдёт вовсе, ждать ответа CLI не на что.
      this.settle(askId, { state: 'cancelled' })
    }

    return this.thread(conversationId)
  }

  /**
   * Строка прогресса служебного запроса - не событие разговора: в ленту она
   * не идёт. true - строка прогресса (своя или нет).
   */
  progress(message: CliMessage): boolean {
    const progress = progressOf(message, Date.now())

    if (!progress) return false

    const ask = this.asks.get(progress.requestId)

    if (ask) {
      const thread = this.thread(ask.conversationId)

      this.put(ask.conversationId, withRetry(thread, progress.requestId, progress.retry))
    }

    return true
  }

  /**
   * Разговор сменился (/clear): первое уточнение понесло бы в контекст ответы о прошлом
   * разговоре. Вопросы в пути отменяются.
   */
  forget(conversationId: string): void {
    for (const [id, ask] of this.asks) {
      if (ask.conversationId !== conversationId) continue

      if (ask.process) ask.process.cancelControl(id)
      else this.settle(id, { state: 'cancelled' })
    }

    if (this.threads.delete(conversationId)) this.onChange({ conversationId, thread: EMPTY })
  }

  private async run(runtime: ConversationRuntime, id: string, request: object) {
    const process = await runtime.prepareProcess().catch(() => null)
    const ask = this.asks.get(id)

    // Отменили, пока процесс поднимался: спрашивать некого.
    if (!ask) return this.sleepAfter(runtime, process)
    if (!process) return this.settle(id, { state: 'failed', failure: 'ended', message: '' })

    ask.process = process
    // По сроку CLI просят остановиться: иначе он доработал бы впустую.
    ask.timer = setTimeout(() => {
      process.cancelControl(id)
      this.settle(id, { state: 'failed', failure: 'timeout', message: '' })
    }, ASIDE_TIMEOUT_MS)

    try {
      this.settle(id, answerOf(await process.control({ ...request }, id)))
    } catch (error) {
      // Отказ CLI - его словами; процесс ушёл, не ответив, - «разговор остановился».
      this.settle(
        id,
        error instanceof CliReplyError
          ? failureOf(error.message)
          : { state: 'failed', failure: 'ended', message: '' },
      )
    } finally {
      this.sleepAfter(runtime, process)
    }
  }

  /** Конец вопроса - один раз: срок и поздняя ошибка «отменено» второго конца не дают. */
  private settle(id: string, ending: AsideEnding) {
    const ask = this.asks.get(id)

    if (!ask) return

    if (ask.timer) clearTimeout(ask.timer)

    this.asks.delete(id)
    this.end(ask.conversationId, id, ending)

    const waiter = this.waiters.get(id)

    this.waiters.delete(id)
    waiter?.(this.exchangeOf(ask.conversationId, id))
  }

  private exchangeOf(conversationId: string, id: string): AsideExchange | null {
    return this.thread(conversationId).exchanges.find((exchange) => exchange.id === id) ?? null
  }

  /** Вопрос поднял спящий процесс: без хода сам он не уснул бы никогда. */
  private sleepAfter(runtime: ConversationRuntime, process: CliProcess | null) {
    if (process && runtime.isFree && !runtime.isDisposed && runtime.process === process) {
      runtime.scheduleSleep()
    }
  }

  private end(conversationId: string, id: string, ending: AsideEnding) {
    const thread = this.threads.get(conversationId)

    if (thread) this.put(conversationId, withEnding(thread, id, ending))
  }

  private put(conversationId: string, thread: AsideThread) {
    this.threads.set(conversationId, thread)
    this.onChange({ conversationId, thread })
  }
}

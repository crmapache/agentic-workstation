import type { AsideRetry, AsideThread, AsideFailure, AsideExchange } from '@shared/panel-extras'

import type { CliMessage } from '../cli/cli-messages'
import { isRecord, numberField, stringField } from '../cli/cli-messages'
import {
  ASIDE_SUBTYPE,
  ASIDE_PROGRESS,
  ASIDE_CANCELLED,
  ASIDE_TEXT_LIMIT,
  ASIDE_THREAD_KEPT,
  ASIDE_HISTORY_SENT,
} from './panel.constants'

/**
 * Вопрос сбоку (/btw) - формы служебного запроса CLI `side_question` (замер ACC на
 * 2.1.280): запрос с вопросом и прошлыми ответами (своей цепочки у CLI для потока нет),
 * ответ `{response, synthetic, refusal_fallback?}`, строка прогресса
 * `system/control_request_progress` (started, api_retry), отмена - ошибкой ровно
 * «Side question cancelled». Цепочка вкладки - здесь же, чистыми переходами.
 */

/** Чем кончился вопрос: ответ модели, заглушка CLI, отмена или отказ. */
export type AsideEnding =
  | { state: 'answered'; text: string; notice: string }
  | { state: 'empty'; text: string }
  | { state: 'cancelled' }
  | { state: 'failed'; failure: AsideFailure; message: string }

/** Прошлый ответ в том виде, в каком CLI ждёт его обратно. */
type HistoryEntry = { question: string; response: string; fallback_notice?: string }

/** Тело запроса: вопрос и до десяти прошлых настоящих ответов модели. */
export const sideRequest = (question: string, history: readonly AsideExchange[]) => ({
  subtype: ASIDE_SUBTYPE,
  question: question.slice(0, ASIDE_TEXT_LIMIT),
  history: history.map((exchange): HistoryEntry => ({
    question: exchange.question.slice(0, ASIDE_TEXT_LIMIT),
    response: exchange.text.slice(0, ASIDE_TEXT_LIMIT),
    ...(exchange.notice && { fallback_notice: exchange.notice }),
  })),
})

/**
 * Ответ CLI. Пусто - ответа нет; synthetic - заглушка CLI (отказанный инструмент,
 * обрезанный ответ, ошибка API): нарисованная ответом, она читалась бы словами модели.
 */
export const answerOf = (response: unknown): AsideEnding => {
  const body = isRecord(response) ? response : {}
  const text = stringField(body, 'response').trim()
  const fallback = body['refusal_fallback']
  const notice = isRecord(fallback) ? stringField(fallback, 'content').trim() : ''

  if (!text) return { state: 'empty', text: '' }
  if (body['synthetic'] === true) return { state: 'empty', text }

  return { state: 'answered', text, notice }
}

/** Отказ CLI или своя сдача - по словам: CLI говорит «отменено» только текстом ошибки. */
export const failureOf = (message: string): AsideEnding =>
  message === ASIDE_CANCELLED
    ? { state: 'cancelled' }
    : { state: 'failed', failure: 'refused', message }

/** Строка прогресса служебного запроса (верхний уровень, а не слово в тексте агента). */
export const progressOf = (
  message: CliMessage,
  at: number,
): { requestId: string; retry: AsideRetry | null } | null => {
  if (message.type !== 'system' || message.subtype !== ASIDE_PROGRESS) return null

  const requestId = stringField(message, 'request_id')

  if (!requestId) return null
  if (stringField(message, 'status') !== 'api_retry') return { requestId, retry: null }

  return {
    requestId,
    retry: {
      attempt: numberField(message, 'attempt') || 1,
      maxRetries: numberField(message, 'max_retries'),
      retryAt: at + Math.max(0, numberField(message, 'retry_delay_ms')),
    },
  }
}

/**
 * Прошлые ответы для нового вопроса: только настоящие ответы модели, новые последними.
 * Заглушка, отмена и ошибка в контексте следующего вопроса читались бы её словами;
 * without - вопрос, который задают заново.
 */
export const sideHistory = (thread: AsideThread, without: string | null): AsideExchange[] =>
  thread.exchanges
    .filter((item) => item.id !== without && item.state === 'answered' && item.text)
    .slice(-ASIDE_HISTORY_SENT)

/** Цепочка с новым вопросом: на месте того, что кончился без ответа, или в конце. */
export const withAsked = (
  thread: AsideThread,
  asked: AsideExchange,
  replaces: string | null,
): AsideThread => {
  const place = replaces ? thread.exchanges.findIndex((item) => item.id === replaces) : -1
  const exchanges =
    place >= 0
      ? thread.exchanges.map((item, index) => (index === place ? asked : item))
      : trimmed([...thread.exchanges, asked])

  return { open: true, exchanges }
}

/** Повтор API у вопроса, который ещё ждёт: started - повторы кончились. */
export const withRetry = (thread: AsideThread, id: string, retry: AsideRetry | null) => ({
  ...thread,
  exchanges: thread.exchanges.map((item) =>
    item.id === id && item.state === 'asking' ? { ...item, retry } : item,
  ),
})

/**
 * Конец вопроса. Только тот, что ещё ждёт: второй ответ на тот же id ничего не
 * перетирает. Ответ под закрытую карточку её не открывает: закрыл - значит решил.
 */
export const withEnding = (thread: AsideThread, id: string, ending: AsideEnding): AsideThread => ({
  ...thread,
  exchanges: thread.exchanges.map((item) =>
    item.id === id && item.state === 'asking'
      ? {
          ...item,
          state: ending.state,
          text: 'text' in ending ? ending.text : '',
          notice: 'notice' in ending ? ending.notice : '',
          failure: 'failure' in ending ? ending.failure : null,
          message: 'message' in ending ? ending.message : '',
          retry: null,
        }
      : item,
  ),
})

/** Новейшие ASIDE_THREAD_KEPT; ждущий ответа не выбрасывается - ответу некуда было бы лечь. */
const trimmed = (exchanges: AsideExchange[]): AsideExchange[] => {
  let excess = exchanges.length - ASIDE_THREAD_KEPT

  return excess <= 0
    ? exchanges
    : exchanges.filter((item) => {
        if (excess > 0 && item.state !== 'asking') {
          excess -= 1

          return false
        }

        return true
      })
}

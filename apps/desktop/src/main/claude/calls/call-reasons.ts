import type { SoundEvent } from '@shared/sounds'
import { SOUND_PRIORITY } from '@shared/sounds'

import type { CliMessage } from '../cli/cli-messages'
import { numberField, recordField, stringField } from '../cli/cli-messages'

/**
 * Когда разговор зовёт человека - правила ACC (sounds.ts там), перенесённые туда, где
 * в IDE видны переходы хода: в главный процесс. Зовёт только живое: транскрипт,
 * поднятый из истории, молчит - его разбор сюда не доходит вовсе.
 */

/**
 * Лимит, узнанный по тексту отказа. Главная дорога другая - событие лимита CLI, но
 * лимит приходит и простым отказом хода, словами CLI. Ошибиться здесь дёшево: промах -
 * прозвучит «что-то сломалось», а не тишина.
 */
const LIMIT_PATTERN =
  /(rate|usage|quota)[ -]?limit|limit (reached|exceeded|is used up)|out of (usage|credits)/i

/** Сервер ответил «слишком много запросов» - это лимит, а не поломка. */
const TOO_MANY_REQUESTS = 429

/** Состояния события лимита, при которых работа идёт как шла. */
const ALLOWED_LIMIT_STATES = new Set(['allowed', 'allowed_warning', 'ok'])

/**
 * Повод по концу хода; null - звать не о чем. Остановил человек - он и так здесь.
 * Фоновый субагент ещё работает - это конец хода, а не работы: позовёт следующий итог.
 */
export const callForResult = (
  result: CliMessage,
  turn: { interrupted: boolean; stillWorking: boolean },
): SoundEvent | null => {
  if (turn.interrupted) return null

  if (result['is_error'] === true) {
    const isLimit =
      LIMIT_PATTERN.test(stringField(result, 'result')) ||
      numberField(result, 'api_error_status') === TOO_MANY_REQUESTS

    return isLimit ? 'limit' : 'error'
  }

  return turn.stillWorking ? null : 'turnDone'
}

/** Ошибка у ответа модели (`assistant.error`): лимит или поломка (в том числе выход из входа). */
export const callForAssistantError = (error: string): SoundEvent | null => {
  if (!error) return null

  return error === 'rate_limit' ? 'limit' : 'error'
}

/**
 * Что значит событие лимита. «rejected» - ещё не остановка: идёт доплата (работа
 * продолжается за деньги - повод свой), льготный шаг дорабатывает, сигнал о прошедшем
 * сбросе устарел. Ключ - окно и его сброс: CLI повторяет событие каждым ходом, пока
 * состояние держится, а звать надо раз на окно.
 */
export const callForRateLimit = (
  message: CliMessage,
  now: number,
): { reason: SoundEvent; key: string } | null => {
  const info = recordField(message, 'rate_limit_info')
  const status = stringField(info, 'status').toLowerCase()
  const resetsAt = numberField(info, 'resetsAt')
  const window = `${stringField(info, 'rateLimitType')}:${resetsAt}`

  if (!status || ALLOWED_LIMIT_STATES.has(status)) return null
  if (info['isUsingOverage'] === true || info['overageInUse'] === true) {
    return { reason: 'extraUsage', key: `extra:${window}` }
  }
  if (info['rateLimitGraceActive'] === true) return null
  // resetsAt CLI присылает в секундах.
  if (resetsAt > 0 && resetsAt * 1000 <= now) return null

  return { reason: 'limit', key: `limit:${window}` }
}

/** Куда звать: разговор и его связь с сервисом (ConversationRuntime). */
type CallTarget = {
  meta: { id: string }
  host: { onCall: (conversationId: string, reason: SoundEvent, key?: string) => void }
}

/**
 * Строка потока, которая зовёт сама по себе: событие лимита и ошибка ответа модели
 * основного разговора. Конец хода зовёт отдельно - по `result` (callForResult).
 */
export const callFromMessage = (
  target: CallTarget,
  message: CliMessage,
  isMain: boolean,
  now = Date.now(),
): void => {
  const limit = message.type === 'rate_limit_event' ? callForRateLimit(message, now) : null
  const failed =
    message.type === 'assistant' && isMain
      ? callForAssistantError(stringField(message, 'error'))
      : null

  if (limit) target.host.onCall(target.meta.id, limit.reason, limit.key)
  if (failed) target.host.onCall(target.meta.id, failed)
}

/**
 * Главный из поводов одной вкладки: ход, оборванный отказом, приносит и ошибку, и
 * конец хода сразу - звучать должно важное, а не два сигнала поверх друг друга.
 */
export const strongestCall = (reasons: ReadonlySet<SoundEvent>): SoundEvent | null =>
  SOUND_PRIORITY.find((reason) => reasons.has(reason)) ?? null

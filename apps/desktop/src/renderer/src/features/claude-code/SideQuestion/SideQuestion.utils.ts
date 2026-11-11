import type { TFunction } from 'i18next'

import type { AsideExchange } from '@shared/claude-panel'
import { SECOND_MS } from '@shared/time-units'

import { formatDuration } from '../claude.utils'

/**
 * Строка ждущего вопроса: «Thinking aside · 12s» или повтор API со счётчиками и
 * секундами до следующей попытки (как в ACC).
 */
export const askingLine = (exchange: AsideExchange, now: number, t: TFunction): string => {
  const { retry } = exchange

  if (retry) {
    return t('claudeCode.aside.retrying', {
      attempt: retry.attempt,
      max: retry.maxRetries,
      seconds: Math.max(0, Math.ceil((retry.retryAt - now) / SECOND_MS)),
    })
  }

  const waited = formatDuration(now - exchange.askedAt).replace(/\.\ds$/, 's')

  return t('claudeCode.aside.thinking', { elapsed: waited })
}

/** Почему вопрос кончился без ответа - нашими словами; и слова CLI строкой ниже, если есть. */
export const unansweredText = (
  exchange: AsideExchange,
  t: TFunction,
): { headline: string; detail: string } => {
  if (exchange.state === 'cancelled')
    return { headline: t('claudeCode.aside.cancelled'), detail: '' }
  if (exchange.state === 'empty')
    return { headline: t('claudeCode.aside.empty'), detail: exchange.text }

  const failure = exchange.failure ?? 'refused'

  return {
    headline: t(`claudeCode.aside.failed.${failure}`),
    detail: failure === 'refused' ? exchange.message : '',
  }
}

/** Метка последнего события цепочки: прокрутка вниз - только на новый вопрос или ответ. */
export const lastMark = (exchanges: readonly AsideExchange[]): string => {
  const last = exchanges.at(-1)

  return last ? `${last.id}:${last.state}` : ''
}

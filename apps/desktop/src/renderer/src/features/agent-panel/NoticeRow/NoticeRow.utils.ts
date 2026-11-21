import type { TFunction } from 'i18next'

import type { LimitFeedItem, RetryFeedItem, CompactFeedItem } from '@shared/conversation-feed'

import { formatClock, formatTokens, formatDuration } from '../panel.utils'
import {
  LIMIT_WINDOW_KEYS,
  RETRY_REASON_KEYS,
  RETRY_OUTCOME_KEYS,
  COMPACT_CEILING_PERCENT,
  COMPACT_TIME_CONSTANT_S,
} from './NoticeRow.constants'

/** Сколько процентов компакта показать через elapsed мс. */
export const compactProgress = (elapsed: number): number => {
  const ratio = 1 - Math.exp(-Math.max(0, elapsed) / 1000 / COMPACT_TIME_CONSTANT_S)

  return Math.min(COMPACT_CEILING_PERCENT, Math.round(ratio * 100))
}

/** Текст строки CONTEXT: идёт, или чем кончился - с цифрами до и после, если они есть. */
export const compactText = (t: TFunction, item: CompactFeedItem): string => {
  if (item.pending) return t('agentPanel.notice.compact.running')

  const manual = item.trigger === 'manual'

  if (!item.preTokens) {
    return manual
      ? t('agentPanel.notice.compact.doneManual')
      : t('agentPanel.notice.compact.doneAuto')
  }

  const before = formatTokens(item.preTokens)
  const after = item.postTokens ? formatTokens(item.postTokens) : ''
  const took = item.durationMs ? formatDuration(item.durationMs) : ''
  const summary = after
    ? t('agentPanel.notice.compact.into', { after })
    : t('agentPanel.notice.compact.intoSummary')

  return [
    t(manual ? 'agentPanel.notice.compact.manually' : 'agentPanel.notice.compact.automatically', {
      before,
      summary,
    }),
    took && t('agentPanel.notice.compact.took', { took }),
  ]
    .filter(Boolean)
    .join(' ')
}

/** Текст строки RETRY: причина, попытка из скольких или чем кончилось. */
export const retryText = (t: TFunction, item: RetryFeedItem): string => {
  const attempt = item.maxRetries
    ? t('agentPanel.notice.retry.attemptOf', { attempt: item.attempt, max: item.maxRetries })
    : t('agentPanel.notice.retry.attempt', { attempt: item.attempt })
  const state = item.pending
    ? attempt
    : t(RETRY_OUTCOME_KEYS[item.outcome ?? 'stopped'], { count: item.attempt })

  return `${t(RETRY_REASON_KEYS[item.reason])} · ${state}`
}

/** Сколько осталось до сброса лимита словами («2h 15m»); null - момент прошёл. */
export const untilReset = (resetsAt: number, now: number): string | null => {
  const minutes = Math.ceil((resetsAt - now) / 60_000)

  if (minutes <= 0) return null
  if (minutes < 60) return `${minutes}m`

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** Время сброса по часам: с этим сравнивают свой день. */
export const resetClock = (resetsAt: number): string => formatClock(resetsAt)

/** Имя окна лимита: известное - словами, незнакомое - как назвал CLI, пустое - без имени. */
export const limitWindow = (t: TFunction, item: LimitFeedItem): string => {
  const key = LIMIT_WINDOW_KEYS[item.window]

  return key ? t(key) : item.window.replace(/_/g, ' ')
}

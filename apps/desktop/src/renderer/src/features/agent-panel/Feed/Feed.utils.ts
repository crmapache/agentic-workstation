import type { TFunction } from 'i18next'

import type { Conversation } from '@shared/conversation'
import type { FeedItem, RetryReason } from '@shared/conversation-feed'

import { pendingAgents } from '../agents.utils'
import { formatDuration } from '../panel.utils'
import { RETRY_REASON_KEYS } from '../NoticeRow/NoticeRow.constants'
import type { StatusParts } from './Feed.types'

/** Что сейчас происходит - последняя строка ленты (как streamStatus в ACC). */
export type StreamStatus =
  | { kind: 'none' }
  | { kind: 'stopping'; since: number }
  | { kind: 'waiting' }
  | { kind: 'retry'; reason: RetryReason; retryAt: number }
  | { kind: 'compacting' }
  | { kind: 'agents'; count: number }
  | { kind: 'thinking'; startedAt: number; pausedMs: number }

/**
 * Строка статуса по разговору и ленте. Порядок важен: «останавливаю» старше всего, вопрос
 * человеку старше работы, повтор и компакт - то единственное, что сейчас идёт, а когда
 * хода нет, но работают фоновые агенты, - ждём их. Время - всего запроса (часы работы),
 * а не последнего хода.
 */
export const streamStatus = (
  conversation: Conversation,
  items: readonly FeedItem[],
): StreamStatus => {
  if (conversation.stopRequestedAt !== null) {
    return { kind: 'stopping', since: conversation.stopRequestedAt }
  }

  if (conversation.status === 'waiting') return { kind: 'waiting' }

  const live = items.findLast((item) => item.kind === 'retry' || item.kind === 'compact')

  if (live?.kind === 'retry' && live.pending) {
    return { kind: 'retry', reason: live.reason, retryAt: live.retryAt }
  }

  if (live?.kind === 'compact' && live.pending) return { kind: 'compacting' }

  if (conversation.status === 'running') {
    return {
      kind: 'thinking',
      startedAt: conversation.workStartedAt ?? conversation.turnStartedAt ?? 0,
      pausedMs: conversation.workStartedAt === null ? 0 : conversation.workPausedMs,
    }
  }

  const agents = pendingAgents(items)

  return agents > 0 ? { kind: 'agents', count: agents } : { kind: 'none' }
}

/**
 * Строка ленты у верхней кромки - делением пополам (строки стоят по порядку, а прокрутка
 * приходит десятками в секунду). bottomOf - низ строки по номеру; ответ - первая строка,
 * чей низ ниже кромки.
 */
export const rowAtEdge = (
  count: number,
  bottomOf: (index: number) => number,
  edge: number,
): number => {
  let low = 0
  let high = count - 1
  let found = count - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)

    if (bottomOf(middle) > edge) {
      found = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }

  return Math.max(0, found)
}

/**
 * Строка статуса словами: что происходит (переливается, пока идёт работа) и рядом -
 * цифры (часы работы, отсчёт до повтора). Цифры отдельно: они меняются каждую секунду, и
 * перелив по ним прыгал бы вместе с шириной строки. now - для часов и отсчёта.
 */
export const statusParts = (t: TFunction, status: StreamStatus, now: number): StatusParts => {
  switch (status.kind) {
    case 'stopping':
      return { label: t('agentPanel.stream.stopping'), detail: '' }
    case 'waiting':
      return { label: t('agentPanel.stream.waitingForYou'), detail: '' }
    case 'compacting':
      return { label: t('agentPanel.stream.compacting'), detail: '' }
    case 'agents':
      return {
        label:
          status.count === 1
            ? t('agentPanel.stream.waitingForSubagent')
            : t('agentPanel.stream.waitingForSubagents', { count: status.count }),
        detail: '',
      }
    case 'retry':
      return {
        label: t(RETRY_REASON_KEYS[status.reason]),
        detail: t('agentPanel.stream.retryWaiting', {
          waited: formatDuration(Math.max(0, status.retryAt - now)),
        }),
      }
    case 'thinking':
      return {
        label: t('agentPanel.stream.thinking'),
        detail: status.startedAt ? formatDuration(now - status.startedAt - status.pausedMs) : '',
      }
    default:
      return { label: '', detail: '' }
  }
}

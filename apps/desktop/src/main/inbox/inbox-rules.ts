import type {
  InboxItem,
  InboxKind,
  InboxTone,
  InboxAction,
  InboxOrigin,
  InboxActionKind,
} from '@shared/inbox'
import { isInboxAsking } from '@shared/inbox'
import { isProviderId } from '@shared/providers'
import { DAY_MS } from '@shared/time-units'

import { blankItem, questionsOf } from './inbox-items'

/** Закрытые помнятся месяц и не больше этого числа: это лента, а не архив. */
export const DONE_KEPT = 200

/**
 * Прочитанных открытых отчётов и сообщений - не больше этого: ежечасное задание с отчётом иначе
 * копило бы их сотнями. Вопросы и непрочитанное не считаются и не уходят.
 */
export const OPEN_READ_KEPT = 100
const DONE_DAYS_MS = 30 * DAY_MS

const KINDS: readonly InboxKind[] = [
  'question',
  'permission',
  'plan',
  'report',
  'failure',
  'message',
  'reminder',
]
const TONES: readonly InboxTone[] = ['info', 'attention', 'success', 'danger']
const ACTION_KINDS: readonly InboxActionKind[] = [
  'reply',
  'open',
  'dismiss',
  'allow',
  'deny',
  'approve',
  'revise',
  'answer',
  'showRun',
  'openChat',
  'runAgain',
  'resume',
  'showCalendar',
  'syncCalendar',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown, max = 8_000) => (typeof value === 'string' ? value.slice(0, max) : '')

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

const actionOf = (raw: unknown): InboxAction[] => {
  if (!isRecord(raw)) return []

  const kind = ACTION_KINDS.find((one) => one === raw['kind'])

  return kind
    ? [
        {
          id: text(raw['id'], 40) || kind,
          kind,
          label: text(raw['label'], 80),
          value: text(raw['value'], 4096),
          primary: raw['primary'] === true,
        },
      ]
    : []
}

const originOf = (raw: unknown): InboxOrigin => {
  if (!isRecord(raw)) return { kind: 'none' }

  if (raw['kind'] === 'task') {
    return { kind: 'task', taskId: text(raw['taskId'], 64), runId: text(raw['runId'], 64) }
  }

  if (raw['kind'] === 'chat') {
    return {
      kind: 'chat',
      // Уведомления до провайдеров (этап 5) присылали только разговоры Claude Code.
      provider: isProviderId(raw['provider']) ? raw['provider'] : 'claude',
      conversationId: text(raw['conversationId'], 64),
      sessionId: text(raw['sessionId'], 64),
    }
  }

  return { kind: 'none' }
}

/** Уведомление с диска; чужое и битое - пропускается. */
export const itemOf = (raw: unknown): InboxItem | null => {
  if (!isRecord(raw) || typeof raw['id'] !== 'string') return null

  const kind = KINDS.find((one) => one === raw['kind'])

  if (!kind) return null

  return blankItem({
    id: raw['id'],
    kind,
    tone: TONES.find((one) => one === raw['tone']) ?? 'info',
    title: text(raw['title'], 200),
    body: text(raw['body']),
    source: text(raw['source'], 200),
    projectPath: text(raw['projectPath'], 4096),
    origin: originOf(raw['origin']),
    actions: Array.isArray(raw['actions']) ? raw['actions'].flatMap(actionOf) : [],
    questions: questionsOf({ questions: raw['questions'] }),
    tool: text(raw['tool'], 200),
    detail: text(raw['detail'], 2000),
    reason: text(raw['reason'], 40),
    requestId: text(raw['requestId'], 200),
    createdAt: number(raw['createdAt']),
    deliverAt: number(raw['deliverAt']),
    arrivedAt: number(raw['arrivedAt']),
    readAt: number(raw['readAt']),
    doneAt: number(raw['doneAt']),
    outcome: text(raw['outcome'], 120),
  })
}

/**
 * Вопрос прогона, оставшийся с прошлого запуска IDE: процесса, который спрашивал, нет - ответ
 * некуда отдать. Он закрывается, а оборванный прогон приходит своим уведомлением.
 */
export const settleStale = (item: InboxItem, now: number): InboxItem =>
  item.doneAt === 0 && item.requestId ? { ...item, doneAt: now, outcome: 'withdrawn' } : item

/** Закрыть: чем (подпись кнопки или слово) и когда; закрытое не трогается. */
export const closeItem = (item: InboxItem, outcome: string, now: number): InboxItem =>
  item.doneAt === 0 ? { ...item, doneAt: now, readAt: item.readAt || now, outcome } : item

/**
 * Новые первыми; закрытые - не старше месяца и не больше DONE_KEPT, прочитанные открытые без
 * вопроса - не больше OPEN_READ_KEPT.
 */
export const pruneItems = (items: readonly InboxItem[], now: number): InboxItem[] => {
  let done = 0
  let read = 0

  return [...items]
    .sort((left, right) => right.deliverAt - left.deliverAt || right.createdAt - left.createdAt)
    .filter((item) => {
      if (item.doneAt === 0) {
        if (item.readAt === 0 || isInboxAsking(item)) return true

        read += 1

        return read <= OPEN_READ_KEPT
      }

      if (now - item.doneAt > DONE_DAYS_MS) return false

      done += 1

      return done <= DONE_KEPT
    })
}

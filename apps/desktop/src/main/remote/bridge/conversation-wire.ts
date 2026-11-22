import type { Conversation, PendingRequest } from '@shared/conversation'
import type { ProviderId } from '@shared/providers'

import type { UsageWire } from '@agentic-workstation/remote-protocol/machine-wire-types'
import type {
  PendingWire,
  ConversationWire,
  ConversationStatus,
  ConversationOutcome,
  ConversationSummary,
} from '@agentic-workstation/remote-protocol/wire-types'

import { actionWire } from './action-wire'

/** Состояние для телефона: ход ждёт человека, идёт (и фоновые агенты), свободен. */
export const statusOf = (conversation: Conversation): ConversationStatus => {
  if (conversation.pending || conversation.status === 'waiting') return 'waiting-for-you'
  if (conversation.status === 'running' || conversation.backgroundWork) return 'running'

  return 'idle'
}

/**
 * С какого момента разговор в своём состоянии: IDE хранит начало работы и хода, но не начало
 * ожидания и простоя - их помнят часы моста по первой встрече с состоянием.
 */
export class StatusClock {
  private readonly seen = new Map<string, { status: ConversationStatus; since: number }>()

  since(conversation: Conversation, now: number): number {
    const status = statusOf(conversation)
    const known = this.seen.get(conversation.id)

    if (known?.status === status) return known.since

    const since =
      status === 'running'
        ? (conversation.workStartedAt ?? conversation.turnStartedAt ?? now)
        : known
          ? now
          : conversation.updatedAt || now

    this.seen.set(conversation.id, { status, since })

    return since
  }

  /** Разговоров, которых нет, часы не помнят. */
  keep(ids: ReadonlySet<string>): void {
    for (const id of this.seen.keys()) if (!ids.has(id)) this.seen.delete(id)
  }
}

/** Исход хода словом протокола: ошибка API или лимит у провайдера - failed. */
const outcomeOf = (conversation: Conversation): ConversationOutcome =>
  conversation.outcome === 'error' ? 'failed' : conversation.outcome

/** Имя разговора, как его видит телефон: ещё без имени - имя источника форка или «New chat». */
export const titleOf = (conversation: Conversation): string =>
  conversation.title || conversation.fork?.sourceTitle || 'New chat'

/**
 * Пустая вкладка «New chat»: у окна она есть всегда, а на телефоне - лишняя строка (просьба
 * владельца). Начатый разговор узнаётся по имени (первое сообщение с текстом даёт его сразу),
 * итогу хода (сообщение из одной картинки имени не даёт) и контексту; форк несёт чужой разговор.
 */
export const isBlank = (conversation: Conversation): boolean =>
  !conversation.title &&
  !conversation.fork &&
  conversation.outcome === 'none' &&
  statusOf(conversation) === 'idle' &&
  conversation.queue.length === 0 &&
  conversation.usage.contextTokens === 0

/** Разговор в списке машины - с провайдером его панели. */
export const summaryOf = (
  conversation: Conversation,
  provider: ProviderId,
  since: number,
): ConversationSummary => ({
  id: conversation.id,
  provider,
  title: titleOf(conversation),
  status: statusOf(conversation),
  outcome: outcomeOf(conversation),
  since,
  waiting: conversation.pending?.kind ?? null,
  ...(isBlank(conversation) && { blank: true }),
})

/**
 * Вопрос хода - без «разрешать всегда»: такой ответ с телефона не даётся. Целиком: урезала ли
 * его дорога до телефона, скажет fitConversation (fit-pending.ts). У разрешения - и вид
 * действия: по нему телефон показывает вызов любого провайдера.
 */
const pendingOf = (pending: PendingRequest | null): PendingWire | null => {
  if (!pending) return null

  switch (pending.kind) {
    case 'permission':
      return {
        kind: 'permission',
        requestId: pending.requestId,
        toolName: pending.toolName,
        description: pending.description,
        reason: pending.reason,
        input: pending.input,
        truncated: false,
        action: actionWire(pending.action),
      }
    case 'question':
      return {
        kind: 'question',
        requestId: pending.requestId,
        questions: pending.questions,
        truncated: false,
      }
    case 'plan':
      return { kind: 'plan', requestId: pending.requestId, plan: pending.plan, truncated: false }
  }
}

/**
 * Разговор целиком - тому, кто его смотрит. Папки проекта здесь нет: только ключ.
 * unavailableModes - что окно гасит этой вкладке в меню MODE (ModeGate.offFor), usage - лимиты
 * аккаунта, на котором идёт разговор (выбранный в панели его провайдера).
 */
export const conversationWire = (
  conversation: Conversation,
  provider: ProviderId,
  projectKey: string,
  since: number,
  unavailableModes: readonly string[],
  usage: UsageWire | null,
): ConversationWire => ({
  ...summaryOf(conversation, provider, since),
  projectKey,
  model: conversation.model,
  effort: conversation.effort,
  permissionMode: conversation.permissionMode,
  activeModel: conversation.activeModel,
  pending: pendingOf(conversation.pending),
  pendingCount: conversation.pendingCount,
  queue: conversation.queue.map(({ id, text, imageCount }) => ({ id, text, imageCount })),
  turnStartedAt: conversation.turnStartedAt,
  workStartedAt: conversation.workStartedAt,
  workPausedMs: conversation.workPausedMs,
  error: conversation.error,
  context: { tokens: conversation.usage.contextTokens, window: conversation.usage.contextWindow },
  stopRequestedAt: conversation.stopRequestedAt,
  queueHold: conversation.queueHold ?? null,
  carryOn: conversation.carryOn ?? null,
  fast: { asked: conversation.fastMode === true, state: conversation.fastReport?.state ?? null },
  unavailableModes: [...unavailableModes],
  usage,
})

import type { Conversation, PendingRequest } from '@shared/claude'
import type { ProviderId } from '@shared/providers'

import type {
  PendingWire,
  ConversationWire,
  ConversationStatus,
  ConversationOutcome,
  ConversationSummary,
} from '@agentic-workstation/remote-protocol/wire-types'

/** Разговоры панели - провайдера Claude Code; второй провайдер принесёт свой id. */
export const CLAUDE_PROVIDER: ProviderId = 'claude'

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

export const summaryOf = (conversation: Conversation, since: number): ConversationSummary => ({
  id: conversation.id,
  provider: CLAUDE_PROVIDER,
  title: titleOf(conversation),
  status: statusOf(conversation),
  outcome: outcomeOf(conversation),
  since,
  waiting: conversation.pending?.kind ?? null,
})

/**
 * Вопрос хода - без «разрешать всегда»: такой ответ с телефона не даётся. Целиком: урезала ли
 * его дорога до телефона, скажет fitConversation (fit-pending.ts).
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

/** Разговор целиком - тому, кто его смотрит. Папки проекта здесь нет: только ключ. */
export const conversationWire = (
  conversation: Conversation,
  projectKey: string,
  since: number,
): ConversationWire => ({
  ...summaryOf(conversation, since),
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
})

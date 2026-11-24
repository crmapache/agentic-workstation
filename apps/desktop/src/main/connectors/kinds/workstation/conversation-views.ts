import type { Conversation, PendingRequest } from '@shared/conversation'
import type { FeedItem, ToolAction } from '@shared/conversation-feed'

import { ArgumentError } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import type { ConversationsPort } from '../../../remote/bridge/bridge-ports'
import { timeOf } from './workstation-args'

/** Потолок одного сообщения в ответе read_conversation: длинный ответ модели - началом и концом. */
const MESSAGE_MAX = 2000

const short = (text: string, max = MESSAGE_MAX): string =>
  text.length > max ? `${text.slice(0, max / 2)}\n…\n${text.slice(-max / 2)}` : text

/** На чём стоит разговор: разрешение, вопрос или план ждут человека. */
const pendingView = (pending: PendingRequest | null) => {
  if (!pending) return null
  if (pending.kind === 'permission') {
    return { kind: 'permission', tool: pending.toolName, what: pending.description }
  }
  if (pending.kind === 'question') {
    return {
      kind: 'question',
      questions: pending.questions.map((question) => ({
        question: question.question,
        options: question.options.map((option) => option.label),
      })),
    }
  }

  return { kind: 'plan', plan: short(pending.plan, 600) }
}

/** Разговор панели для модели; you - это разговор, который спрашивает. */
export const conversationView = (
  provider: string,
  conversation: Conversation,
  caller: string | null,
) => ({
  id: conversation.id,
  provider,
  project: conversation.projectPath,
  title: conversation.title,
  status: conversation.status,
  waitingFor: pendingView(conversation.pending),
  sessionId: conversation.sessionId,
  model: conversation.activeModel ?? conversation.model,
  effort: conversation.effort,
  permissionMode: conversation.permissionMode,
  queuedMessages: conversation.queue.length,
  updated: timeOf(conversation.updatedAt),
  ...(conversation.id === caller && { you: true }),
})

/** Что делает вызов инструмента - одной строкой. */
const actionText = (action: ToolAction): string => {
  switch (action.kind) {
    case 'read':
    case 'edit':
    case 'write':
      return action.path
    case 'search':
      return `${action.pattern} ${action.path}`.trim()
    case 'command':
      return action.command
    case 'monitor':
      return action.command || action.url
    case 'web':
    case 'other':
      return action.target
    case 'mcp':
      return `${action.server}.${action.tool} ${action.target}`.trim()
    case 'skill':
      return action.skill
    case 'agent':
      return action.description
    case 'plan':
      return 'plan'
    case 'question':
      return action.questions.join(' / ')
    case 'todo':
      return 'todo list'
    case 'artifact':
      return `${action.summary} ${action.path}`.trim()
  }
}

/** Лента разговора текстом: сообщения человека и модели целиком, вызовы - строкой. */
export const feedText = (items: readonly FeedItem[]) =>
  items.flatMap((item) => {
    if (item.parentToolUseId !== null) return []

    switch (item.kind) {
      case 'user':
        return [{ from: 'person', at: timeOf(item.time), text: short(item.text) }]
      case 'assistant':
        return item.text.trim() ? [{ from: 'assistant', text: short(item.text) }] : []
      case 'tool':
        return [
          { from: 'tool', text: `${item.name} ${actionText(item.action)}`, status: item.status },
        ]
      default:
        return []
    }
  })

/** Панель, у которой этот разговор, и сам разговор; нет такого - отказ словами для модели. */
export const ownerOf = (
  ports: WorkstationPorts,
  conversationId: string,
): { port: ConversationsPort; conversation: Conversation } => {
  for (const port of ports.panels()) {
    const conversation = port
      .getState()
      .conversations.find((candidate) => candidate.id === conversationId)

    if (conversation) return { port, conversation }
  }

  throw new ArgumentError(
    `No open conversation ${conversationId}: list_conversations shows the open ones.`,
  )
}

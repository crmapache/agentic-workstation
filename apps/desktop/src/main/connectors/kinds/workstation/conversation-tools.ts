import { effortLevelOf } from '@shared/conversation'
import type { ConversationOptions } from '@shared/conversation'
import type { ProviderId } from '@shared/providers'

import { numberArg, stringArg, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import type { ConversationsPort } from '../../../remote/bridge/bridge-ports'
import { ownerOf, feedText, conversationView } from './conversation-views'
import {
  timeOf,
  callerOf,
  projectOf,
  listScopeOf,
  PROJECT_ARG,
  providerArg,
  openProjectOf,
} from './workstation-args'

const PROVIDER_ARG = {
  type: 'string',
  description: 'claude (Claude Code), codex or opencode (open models). Default claude.',
}

const panelOf = (ports: WorkstationPorts, provider: ProviderId): ConversationsPort => {
  const port = ports.panels().find((one) => one.provider === provider)

  if (!port) throw new ArgumentError(`The ${provider} panel is not in the IDE.`)

  return port
}

/** Модель и усилие новой вкладки; не названы - как у новой вкладки человека. */
const optionsOf = (args: Record<string, unknown>): ConversationOptions => {
  const model = stringArg(args, 'model')
  const effortWord = stringArg(args, 'effort')
  const effort = effortWord ? effortLevelOf(effortWord) : null

  if (effortWord && !effort) throw new ArgumentError(`No effort level ${effortWord}.`)

  return { ...(model && { model }), ...(effort && { effort }) }
}

/**
 * Сообщение разговору: свободному - сразу, занятому ходом или вопросом - в его очередь, она уйдёт
 * после хода. Посреди чужого хода или вопроса оно ответило бы за человека.
 */
const deliver = async (port: ConversationsPort, conversationId: string, text: string) => {
  const conversation = port.getState().conversations.find((one) => one.id === conversationId)
  const free = conversation?.status === 'idle' && !conversation.pending
  const message = { text, images: [] }

  if (free) await port.send(conversationId, message)
  else await port.enqueue(conversationId, message)

  return free ? 'sent' : 'queued until its turn ends'
}

/** Разговоры панелей провайдеров: список, чтение, новый или прошлый, сообщение, стоп. */
export const CONVERSATION_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'list_conversations',
    description:
      'Open conversations (tabs) of the provider panels: Claude Code, Codex, open models. Status idle, running or waiting (on a permission, question or plan of the person). The one marked you is this conversation.',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        all_projects: { type: 'boolean', description: 'Conversations of every project.' },
        provider: PROVIDER_ARG,
      },
    },
    run: (args, ports, call) => {
      const path = listScopeOf(args, call, ports.projects)
      const provider = providerArg(args)

      return Promise.resolve({
        conversations: ports
          .panels()
          .filter((port) => !provider || port.provider === provider)
          .flatMap((port) =>
            port
              .getState()
              .conversations.filter((one) => !path || one.projectPath === path)
              .map((one) => conversationView(port.provider, one, callerOf(call))),
          ),
      })
    },
  },
  {
    name: 'list_past_conversations',
    description:
      'Past conversations of a project for one provider, newest first, with their session ids: open_conversation opens one again.',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        provider: PROVIDER_ARG,
        limit: { type: 'number', description: 'Default 20, up to 100.' },
      },
    },
    run: async (args, ports, call) => {
      const port = panelOf(ports, providerArg(args) ?? 'claude')
      const history = await port.history(projectOf(args, call, ports.projects))
      const limit = numberArg(args, 'limit', { min: 1, max: 100, fallback: 20 })

      return {
        conversations: history.slice(0, limit).map((entry) => ({
          sessionId: entry.sessionId,
          title: entry.title,
          updated: timeOf(entry.updatedAt),
          open: entry.isOpen,
        })),
      }
    },
  },
  {
    name: 'read_conversation',
    description:
      'The latest messages of an open conversation: the person, the assistant and one line per tool call (subagent work is left out).',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string' },
        last: {
          type: 'number',
          description: 'How many entries from the end. Default 20, up to 100.',
        },
      },
      required: ['conversation_id'],
    },
    run: async (args, ports, call) => {
      const { port, conversation } = ownerOf(ports, stringArg(args, 'conversation_id', true))
      const feed = await port.getFeed(conversation.id)
      const entries = feedText(feed.items)
      const last = numberArg(args, 'last', { min: 1, max: 100, fallback: 20 })

      return {
        conversation: conversationView(port.provider, conversation, callerOf(call)),
        entries: entries.slice(-last),
        earlierExists: feed.hasEarlier || entries.length > last,
      }
    },
  },
  {
    name: 'open_conversation',
    description:
      'Open a conversation tab in an open project: a new one, or a past one again by session_id; optionally send it a first message. The tab opens the way a new tab opens for the person (their permission mode for new chats).',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        provider: PROVIDER_ARG,
        session_id: { type: 'string', description: 'A past conversation to open again.' },
        message: { type: 'string', description: 'Send this to it.' },
        model: { type: 'string', description: 'New conversation only.' },
        effort: { type: 'string', description: 'New conversation only: low ... max.' },
      },
    },
    run: async (args, ports, call) => {
      const path = openProjectOf(args, call, ports.projects)
      const port = panelOf(ports, providerArg(args) ?? 'claude')
      const sessionId = stringArg(args, 'session_id')
      const id = sessionId
        ? await port.openHistory(path, sessionId)
        : await port.newConversation(path, optionsOf(args))

      if (!id) throw new ArgumentError(`No past conversation ${sessionId} in this project.`)

      const message = stringArg(args, 'message')
      const delivered = message ? await deliver(port, id, message) : null

      return { conversationId: id, provider: port.provider, project: path, message: delivered }
    },
  },
  {
    name: 'send_message',
    description:
      'Send a message to another open conversation as if the person typed it. A busy conversation (running or waiting on the person) gets it in its queue, sent when its turn ends.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: { conversation_id: { type: 'string' }, text: { type: 'string' } },
      required: ['conversation_id', 'text'],
    },
    run: async (args, ports, call) => {
      const { port, conversation } = ownerOf(ports, stringArg(args, 'conversation_id', true))

      if (conversation.id === callerOf(call)) {
        throw new ArgumentError('This is your own conversation: just go on.')
      }

      return { message: await deliver(port, conversation.id, stringArg(args, 'text', true)) }
    },
  },
  {
    name: 'stop_conversation',
    description: 'Stop the turn an open conversation is running, like Stop in its tab.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: { conversation_id: { type: 'string' } },
      required: ['conversation_id'],
    },
    run: (args, ports, call) => {
      const { port, conversation } = ownerOf(ports, stringArg(args, 'conversation_id', true))

      if (conversation.id === callerOf(call)) {
        throw new ArgumentError('This is your own conversation: just end your turn.')
      }

      port.interrupt(conversation.id)

      return Promise.resolve({ stopped: true })
    },
  },
]

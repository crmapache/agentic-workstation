import type { SlashCommand } from '@shared/conversation'

import { unsupported } from '../client/acp-process'
import type {
  AcpSessionUpdate,
  AcpPermissionRequest,
  AcpElicitationRequest,
} from '../protocol/acp-types'
import { outranks } from '../../agents/tabs/tab-names'
import { acpOf } from './acp-conversation'
import { viewOf, replyOf, holdForm, isAllowed, planTextOf, holdPermission } from './acp-requests'
import type { AcpSession } from './acp-session'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Виды обновлений, которые идут в ленту (`AcpFeedBuilder.update`). */
const FEED_UPDATES: ReadonlySet<string> = new Set([
  'agent_message_chunk',
  'agent_thought_chunk',
  'user_message_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
  'compaction_update',
])

/** Команды агента - подсказке «/»: имя и описание. */
const commandsOf = (
  update: Extract<AcpSessionUpdate, { sessionUpdate: 'available_commands_update' }>,
) =>
  update.availableCommands.map((command): SlashCommand => ({
    name: command.name,
    description: command.description ?? '',
    argumentHint: '',
    builtin: true,
  }))

/**
 * Обновление своей сессии (`session/update`) - в ленту и в разговор: окно контекста, имя
 * вкладки, режим, который агент сменил сам, меню моделей, команды «/».
 */
export const routeUpdate = (session: AcpSession, params: unknown): void => {
  if (!isRecord(params) || params['sessionId'] !== session.sessionId) return

  const update = params['update'] as AcpSessionUpdate
  const { runtime } = session
  const { feed, host } = acpOf(runtime)

  if (FEED_UPDATES.has(update.sessionUpdate)) {
    feed.builder.update(update)
    feed.schedule()

    return
  }

  switch (update.sessionUpdate) {
    case 'usage_update':
      runtime.update({ usage: { contextTokens: update.used, contextWindow: update.size } })
      return
    case 'session_info_update':
      // Агент с `title` шлёт здесь начало сообщения, а не имя (Kimi): имя спрашивается отдельно.
      if (host.agent.title) return
      if (update.title && outranks('llm', runtime.meta.titleSource)) {
        runtime.update({ title: update.title, titleSource: 'llm' })
      }
      return
    case 'current_mode_update': {
      // Режим вкладки и так переводится в присланный (у `agy` «без вопросов» - флаг процесса,
      // а режим ACP при нём обычный): вкладку не трогать.
      if (host.agent.modeOf(runtime.meta.permissionMode) === update.currentModeId) return

      const mode = host.agent.modeFrom(update.currentModeId)

      if (mode && mode !== runtime.meta.permissionMode) runtime.update({ permissionMode: mode })
      return
    }
    case 'config_option_update':
      session.noteSetup({ configOptions: update.configOptions })
      return
    case 'available_commands_update':
      host.onAgentCommands(runtime.meta.projectPath, commandsOf(update))
      return
    case 'notice':
      if (update.message) {
        feed.builder.addNotice('cli-error', update.message)
        feed.schedule()
      }
      return
    default:
      return
  }
}

let questions = 0

/**
 * Запрос агента к клиенту: разрешение и форма - вопросом человеку, ответ - когда он решит;
 * файлы и терминал клиента IDE не объявляет - отказ.
 */
export const routeRequest = (
  session: AcpSession,
  method: string,
  params: unknown,
): Promise<unknown> => {
  const { runtime } = session
  const { feed, host } = acpOf(runtime)

  questions += 1

  const requestId = `acp-${session.epoch}-${questions}`

  if (method === 'session/request_permission' && isRecord(params)) {
    const request = params as AcpPermissionRequest
    const toolUseId = host.agent.toolId(request.toolCall.toolCallId)

    const diffs = (request.toolCall.content ?? []).filter((one) => one.type === 'diff')

    // Вызова, о котором спрашивают, ещё нет в ленте - он встаёт из самого вопроса. Есть - в него
    // ложится дифф из вопроса (`agy` шлёт его только здесь): карточка покажет правку, а не вход.
    if (!feed.builder.items.some((item) => item.id === toolUseId)) {
      feed.builder.update({ sessionUpdate: 'tool_call', ...request.toolCall })
      feed.schedule()
    } else if (diffs.length > 0) {
      feed.builder.update({
        sessionUpdate: 'tool_call_update',
        toolCallId: request.toolCall.toolCallId,
        content: diffs,
      })
      feed.schedule()
    }

    const plan = planTextOf(request)

    // План Kimi лежит только в тексте вопроса (вход `ExitPlanMode` - «{}»): карточке плана - в
    // вызов ленты.
    if (plan) {
      feed.builder.update({
        sessionUpdate: 'tool_call_update',
        toolCallId: request.toolCall.toolCallId,
        kind: 'switch_mode',
        rawInput: { plan },
      })
      feed.schedule()
    }

    const view = viewOf(feed.builder.items, toolUseId)

    return new Promise((reply) => {
      const held = holdPermission(
        requestId,
        request,
        toolUseId,
        view,
        runtime.meta.permissionMode,
        reply,
      )

      // Свои серверы IDE, которые человек не спрашивает (уведомления, чтение IDE), - сразу «да».
      if (isAllowed(acpOf(runtime).allowed, view?.action)) {
        reply(replyOf(held, { kind: 'permission', decision: { behavior: 'allow' } }))

        return
      }

      void runtime.hold(held)
    })
  }

  if (method === 'elicitation/create' && isRecord(params)) {
    const request = params as AcpElicitationRequest

    // Только формы: переход по ссылке IDE не объявляет.
    if (request.mode !== 'form') return Promise.resolve({ action: 'decline' })

    return new Promise((reply) => void runtime.hold(holdForm(requestId, request, reply)))
  }

  return unsupported(method)
}

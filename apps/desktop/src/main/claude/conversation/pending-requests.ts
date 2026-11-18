import type { Question, PermissionMode, RequestResponse } from '@shared/claude'

import type { ControlRequest } from '../cli/cli-messages'
import { recordField, stringField, recordsField } from '../cli/cli-messages'
import { claudeToolAction } from '../feed/tool-action'
import { isModQuestion } from '../panel/mod-lines'
import type { HeldRequest as CoreHeld } from '../../agents/conversation/agent-parts'

/** Вопрос CLI вместе с тем, что нужно для ответа, но окну не показывается. */
export type HeldRequest = CoreHeld & {
  input: Record<string, unknown>
  suggestions: Record<string, unknown>[]
}

/** Вопрос, который держит разговор, - вопрос Claude: у него вход вызова и предложения CLI. */
export const isClaudeHeld = (held: CoreHeld): held is HeldRequest =>
  'input' in held && 'suggestions' in held

/** Ответ CLI на управляющий запрос - тело `response` в `control_response`. */
export type ControlAnswer = Record<string, unknown>

/** Что ответить, если человек закрыл вопрос, не выбрав, и пишет своими словами. */
export const QUESTION_DISMISSED =
  "The user closed the question without picking an option and will answer in their own words. Don't ask it again - wait for their message."

/** Отказ, когда человек вместо кнопки написал в чат. Сообщение уходит раньше отказа. */
export const ANSWERED_IN_CHAT =
  'The user did not use the buttons and wrote to you in the chat instead - their message comes right after this. Read it and follow it.'

export const DEFAULT_DENY = 'The user declined.'

export const KEEP_PLANNING = 'The user wants to keep planning: refine the plan and show it again.'

/** Замечание к плану ушло сообщением (в нём картинка): отказ отсылает к нему. */
export const PLAN_ANSWERED_IN_CHAT =
  'The user wants changes to the plan and described them in the chat message that comes right before this. Refine the plan accordingly and show it again.'

/** Цветовые коды терминала в причине отказа: CLI красит её для своего интерфейса. */
const ANSI_COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

const stripAnsi = (text: string) => text.replace(ANSI_COLOR, '')

/** Вопросы AskUserQuestion из входа вызова. */
export const parseQuestions = (input: Record<string, unknown>): Question[] =>
  recordsField(input, 'questions').map((question) => ({
    question: stringField(question, 'question'),
    header: stringField(question, 'header'),
    multiSelect: question['multiSelect'] === true,
    options: recordsField(question, 'options').map((option) => ({
      label: stringField(option, 'label'),
      description: stringField(option, 'description'),
    })),
  }))

/** Как «разрешить и дальше»: правилом в настройках проекта или режимом на сессию. */
const alwaysKindOf = (request: Record<string, unknown>, suggestions: Record<string, unknown>[]) => {
  if (request['suppress_always_allow_rule'] === true) return null
  if (suggestions.some((suggestion) => suggestion['type'] === 'addRules')) return 'rule'
  if (suggestions.some((suggestion) => suggestion['type'] === 'setMode')) return 'mode'

  return request['classifier_approvable'] === false ? null : 'rule'
}

/**
 * Вопрос CLI `can_use_tool` - в карточку для окна. AskUserQuestion и ExitPlanMode
 * приходят тем же запросом, но это не разрешение, а вопрос и план. null - запрос
 * не к чему привязать (нет id вызова или пустой список вопросов): на него сразу отказ.
 * mode - режим разговора в момент вопроса: карточка говорит, под каким режимом спросили.
 */
export const holdRequest = (
  control: ControlRequest,
  mode: PermissionMode = 'default',
): HeldRequest | null => {
  const request = control.request ?? {}
  const toolUseId = stringField(request, 'tool_use_id')
  const toolName = stringField(request, 'tool_name')
  const input = recordField(request, 'input')
  const suggestions = recordsField(request, 'permission_suggestions')
  const requestId = control.request_id

  if (!toolUseId) return null

  if (toolName === 'AskUserQuestion') {
    const questions = parseQuestions(input)

    return questions.length > 0
      ? {
          // Вопрос мода ($.ui.ask) - без вызова в ленте, карточка над полем говорит, чей он.
          pending: {
            kind: 'question',
            requestId,
            toolUseId,
            questions,
            ...(isModQuestion(toolUseId) && { fromMod: true }),
          },
          input,
          suggestions,
        }
      : null
  }

  if (toolName === 'ExitPlanMode') {
    const plan = stringField(input, 'plan')

    return { pending: { kind: 'plan', requestId, toolUseId, plan }, input, suggestions }
  }

  return {
    pending: {
      kind: 'permission',
      requestId,
      toolUseId,
      toolName,
      input,
      action: claudeToolAction(toolName, input),
      description: stripAnsi(stringField(request, 'description')),
      reason: stripAnsi(stringField(request, 'decision_reason')),
      alwaysKind: alwaysKindOf(request, suggestions),
      mode,
    },
    input,
    suggestions,
  }
}

/** Правила для «всегда разрешать»: предложенные CLI, а если их нет - на весь инструмент. */
const alwaysPermissions = (held: HeldRequest, toolName: string) => {
  const rules = held.suggestions.filter((suggestion) => suggestion['type'] === 'addRules')

  if (rules.length > 0) return rules

  const modes = held.suggestions.filter((suggestion) => suggestion['type'] === 'setMode')

  if (modes.length > 0) return modes

  return [
    { type: 'addRules', rules: [{ toolName }], behavior: 'allow', destination: 'localSettings' },
  ]
}

/** Режим, на который переключает «разрешить и дальше», если CLI предложил режим. */
export const modeFromAlways = (held: HeldRequest): string | null => {
  if (held.suggestions.some((suggestion) => suggestion['type'] === 'addRules')) return null

  const mode = held.suggestions.find((suggestion) => suggestion['type'] === 'setMode')

  return mode && typeof mode['mode'] === 'string' ? mode['mode'] : null
}

/** Ответ человека - в тело `control_response` для CLI. */
export const answerFor = (held: HeldRequest, response: RequestResponse): ControlAnswer => {
  const allow = (input: Record<string, unknown>) => ({ behavior: 'allow', updatedInput: input })
  const deny = (message: string) => ({ behavior: 'deny', message: message.trim() || DEFAULT_DENY })

  if (response.kind === 'question') return allow({ ...held.input, answers: response.answers })

  if (response.kind === 'plan') {
    return response.approved ? allow(held.input) : deny(response.feedback || KEEP_PLANNING)
  }

  const { decision } = response

  // «Отвечу в чате» на вопросе - не отказ, а просьба подождать сообщения человека.
  if (decision.behavior === 'deny' && held.pending.kind === 'question' && !decision.message) {
    return deny(QUESTION_DISMISSED)
  }

  if (decision.behavior === 'deny') return deny(decision.message)
  if (decision.behavior === 'allow' || held.pending.kind !== 'permission') return allow(held.input)

  return {
    ...allow(held.input),
    updatedPermissions: alwaysPermissions(held, held.pending.toolName),
  }
}

/** Ответ на вопрос, если человек вместо кнопок написал в чат. */
export const answerInChat = (held: HeldRequest, text: string): ControlAnswer => {
  if (held.pending.kind === 'plan') return { behavior: 'deny', message: text }

  return {
    behavior: 'deny',
    message: held.pending.kind === 'question' ? QUESTION_DISMISSED : ANSWERED_IN_CHAT,
  }
}

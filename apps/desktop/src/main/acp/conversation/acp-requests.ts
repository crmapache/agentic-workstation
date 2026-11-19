import type {
  Question,
  PendingRequest,
  PermissionMode,
  RequestResponse,
} from '@shared/conversation'
import type { FeedItem, ToolAction } from '@shared/conversation-feed'

import type { AcpToolView } from '../feed/acp-feed-builder'
import type {
  AcpFormProperty,
  AcpPermissionOption,
  AcpPermissionRequest,
  AcpElicitationRequest,
} from '../protocol/acp-types'
import type { HeldRequest } from '../../agents/conversation/agent-parts'

/**
 * Вопросы агента ACP к человеку (ADR 0092): разрешение (`session/request_permission`), одобрение
 * плана (у Kimi - разрешение `ExitPlanMode` с вариантами `plan_*`) и форма
 * (`elicitation/create`) - в общие вопросы панели; ответ человека - обратно словами ACP.
 */

/** Вопрос агента, который держит разговор: общий вид и как ответить. */
export type AcpHeld = HeldRequest & {
  /** choice - план с несколькими подходами (Kimi `plan_opt_N`): выбор - вопросом. */
  source: 'permission' | 'plan' | 'choice' | 'form'
  /** Ответ агенту: результат запроса JSON-RPC. */
  reply: (result: unknown) => void
  options: readonly AcpPermissionOption[]
  /** Поля формы по тексту вопроса: ключ, варианты, поле своего ответа. */
  fields: Record<string, FormField>
}

type FormField = {
  key: string
  multi: boolean
  options: { label: string; value: string }[]
  /** Поле для своего ответа (`<ключ>_other` у `agy`); пусто - свой ответ идёт в само поле. */
  other: string
}

export const isAcpHeld = (held: HeldRequest): held is AcpHeld => 'reply' in held && 'source' in held

/** Отказ без выбора: ход отменён или вопрос снят (`cancelled` по схеме ACP). */
export const CANCELLED = { outcome: { outcome: 'cancelled' } }

const selected = (optionId: string) => ({ outcome: { outcome: 'selected', optionId } })

const optionOf = (options: readonly AcpPermissionOption[], ...kinds: string[]) => {
  for (const kind of kinds) {
    const found = options.find((option) => option.kind === kind || option.optionId === kind)

    if (found) return found
  }

  return undefined
}

/** Текст вопроса из содержимого вызова: план у Kimi лежит там целиком. */
const contentText = (request: AcpPermissionRequest): string =>
  (request.toolCall.content ?? [])
    .map((one) => (one.type === 'content' && one.content.type === 'text' ? one.content.text : ''))
    .join('\n')

/**
 * Вопрос - про план: у Kimi это `ExitPlanMode` с вариантами `plan_*` - `plan_approve` или
 * подходы `plan_opt_N` на выбор, `plan_revise`, `plan_reject_and_exit`.
 */
const isPlanRequest = (request: AcpPermissionRequest): boolean =>
  request.toolCall.title === 'ExitPlanMode' ||
  request.options.some((option) => option.optionId.startsWith('plan_'))

/** План с несколькими подходами: выбор подхода - вопросом с вариантами, а не «да / нет». */
const approachesOf = (request: AcpPermissionRequest) =>
  request.options.filter(
    (option) => option.optionId.startsWith('plan_opt_') || option.optionId === 'plan_revise',
  )

/** Текст плана в вопросе - для вызова в ленте (карточка плана). */
export const planTextOf = (request: AcpPermissionRequest): string | null =>
  isPlanRequest(request) ? contentText(request) : null

/**
 * Разрешение - карточкой вопроса с тем, что известно о вызове из ленты (view); план - карточкой
 * плана. «Разрешить и дальше» - только если агент дал такой вариант.
 */
export const holdPermission = (
  requestId: string,
  request: AcpPermissionRequest,
  toolUseId: string,
  view: AcpToolView | null,
  mode: PermissionMode,
  reply: (result: unknown) => void,
): AcpHeld => {
  const base = { reply, options: request.options, fields: {} }

  if (
    isPlanRequest(request) &&
    approachesOf(request).some((one) => one.optionId !== 'plan_revise')
  ) {
    const question = 'Which approach should the agent take?'
    const options = approachesOf(request)

    return {
      ...base,
      source: 'choice',
      fields: {
        [question]: {
          key: '',
          multi: false,
          options: options.map((one) => ({ label: one.name, value: one.optionId })),
          other: '',
        },
      },
      pending: {
        kind: 'question',
        requestId,
        toolUseId,
        questions: [
          {
            question,
            header: 'Plan',
            options: options.map((one) => ({ label: one.name, description: '' })),
            multiSelect: false,
            other: false,
            secret: false,
          },
        ],
      },
    }
  }

  if (isPlanRequest(request)) {
    return {
      ...base,
      source: 'plan',
      pending: { kind: 'plan', requestId, toolUseId, plan: contentText(request) },
    }
  }

  const title = request.toolCall.title ?? ''
  const pending: PendingRequest = {
    kind: 'permission',
    requestId,
    toolUseId,
    toolName: view?.name ?? title,
    input: view?.input ?? {},
    action: view?.action ?? { kind: 'other', target: title, path: '' },
    description: title,
    reason: '',
    alwaysKind: optionOf(request.options, 'allow_always') ? 'rule' : null,
    mode,
  }

  return { ...base, source: 'permission', pending }
}

/** Строка - вопрос (кончается знаком вопроса). */
const asks = (text: string | undefined): text is string => Boolean(text?.trim().endsWith('?'))

const fieldOf = (key: string, property: AcpFormProperty, other: string): FormField => {
  const choices = property.oneOf
    ? property.oneOf.map((one) => ({ label: one.title ?? one.const, value: one.const }))
    : (property.enum ?? property.items?.enum ?? []).map((value) => ({ label: value, value }))
  const itemChoices = property.items?.anyOf?.map((one) => ({
    label: one.title ?? one.const,
    value: one.const,
  }))

  return {
    key,
    multi: property.type === 'array',
    options: itemChoices ?? choices,
    other,
  }
}

/**
 * Форма (`elicitation/create`, режим `form`) - вопросами с вариантами: поле - вопрос, `oneOf` -
 * варианты. Поле `<ключ>_other` (так `agy` даёт свой ответ) - не вопрос, а «другое» у поля.
 */
export const holdForm = (
  requestId: string,
  request: AcpElicitationRequest,
  reply: (result: unknown) => void,
): AcpHeld => {
  const properties = request.requestedSchema?.properties ?? {}
  const keys = Object.keys(properties).filter(
    (key) => !(key.endsWith('_other') && properties[key.slice(0, -'_other'.length)]),
  )
  const fields: Record<string, FormField> = {}
  // Kimi кладёт вопросы всех полей в сообщение строками по порядку полей.
  const lines = request.message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const byLine = keys.length > 1 && lines.length === keys.length
  const questions: Question[] = keys.map((key, index) => {
    const property = properties[key] ?? {}
    const other = properties[`${key}_other`] ? `${key}_other` : ''
    const field = fieldOf(key, property, other)
    const title = property.title ?? ''
    // Вопрос - то, что спрашивает: у `agy` это заголовок поля (сообщение общее, «The agent has
    // a question.»), у Kimi - строка сообщения, а заголовок - короткая подпись («Color»).
    const asked = byLine
      ? (lines[index] ?? '')
      : asks(title)
        ? title
        : asks(request.message)
          ? request.message
          : title || key
    // Текст вопроса - ключ ответа окна: у двух полей он должен быть разным.
    const question = fields[asked] ? `${asked} (${key})` : asked

    fields[question] = field

    return {
      question,
      header: question === title ? '' : title,
      options: field.options.map((option, index) => ({
        label: option.label,
        description: property.oneOf?.[index]?.description ?? '',
      })),
      multiSelect: field.multi,
      other: field.options.length === 0 || other !== '',
      secret: false,
    }
  })

  return {
    pending: { kind: 'question', requestId, toolUseId: '', questions },
    source: 'form',
    reply,
    options: [],
    fields,
  }
}

/**
 * Подписи выбранных вариантов из ответа окна (подписи через «, »): по подписям целиком - у
 * варианта самого бывает запятая («Fast, but risky»).
 */
const labelsOf = (answer: string, field: FormField): string[] => {
  const picked = field.options
    .map((option) => option.label)
    .filter((label) => `, ${answer}, `.includes(`, ${label}, `))

  return picked.length > 0 ? picked : answer.split(', ').filter(Boolean)
}

/** Ответ формы: подпись варианта - его значение, свой ответ - в поле «другое» или в само поле. */
const formContent = (held: AcpHeld, response: RequestResponse): Record<string, unknown> => {
  if (response.kind !== 'question') return {}

  const content: Record<string, unknown> = {}

  for (const [question, answer] of Object.entries(response.answers)) {
    const field = held.fields[question]

    if (!field) continue

    const labels = field.multi ? labelsOf(answer, field) : [answer]
    const values = labels.map((label) => field.options.find((option) => option.label === label))
    const known = labels.length > 0 && values.every(Boolean)

    if (known) {
      content[field.key] = field.multi
        ? values.map((option) => option?.value)
        : (values[0]?.value ?? '')
    } else if (field.other) {
      content[field.other] = answer
    } else {
      content[field.key] = field.multi ? labels : answer
    }
  }

  return content
}

/**
 * Ответ человека словами ACP. Разрешение: «да» - вариант `allow_once`, «да и дальше» -
 * `allow_always`, «нет» - `reject_once`. План: одобрить - `plan_approve`, доработать по
 * замечанию - `plan_revise`, отказ - `plan_reject_and_exit`. Форма - `accept` с содержимым.
 */
export const replyOf = (held: AcpHeld, response: RequestResponse): unknown => {
  if (held.source === 'form') {
    return { action: 'accept', content: formContent(held, response) }
  }

  // Подход плана - вариантом по его подписи; своего текста у выбора нет.
  if (held.source === 'choice') {
    const answer = response.kind === 'question' ? Object.values(response.answers)[0] : undefined
    const field = Object.values(held.fields)[0]
    const option = field?.options.find((one) => one.label === answer)

    return option ? selected(option.value) : CANCELLED
  }

  // Отказ от плана - «доработать» (`plan_revise`, план остаётся): «отказ и выход» Kimi
  // выводит из плана, и дальше он правит файлы без вопроса.
  if (held.source === 'plan') {
    const plan = response.kind === 'plan' ? response : null
    const option = plan?.approved
      ? optionOf(held.options, 'plan_approve')
      : optionOf(held.options, 'plan_revise', 'plan_reject_and_exit')

    return option ? selected(option.optionId) : CANCELLED
  }

  const decision = response.kind === 'permission' ? response.decision.behavior : 'deny'
  const option =
    decision === 'allowAlways'
      ? optionOf(held.options, 'allow_always', 'allow_once')
      : decision === 'allow'
        ? optionOf(held.options, 'allow_once', 'allow_always')
        : optionOf(held.options, 'reject_once', 'reject_always')

  return option ? selected(option.optionId) : CANCELLED
}

/** Снятый вопрос: форма - отменой, разрешение и план - отказом без выбора. */
export const dismissedReply = (held: AcpHeld): unknown =>
  held.source === 'form' ? { action: 'cancel' } : CANCELLED

/** Вызов коннектора, разрешённый без вопроса правилом шлюза: весь сервер или инструмент. */
export const isAllowed = (allowed: readonly string[], action: ToolAction | undefined): boolean =>
  action?.kind === 'mcp' &&
  (allowed.includes(`mcp__${action.server}`) ||
    allowed.includes(`mcp__${action.server}__${action.tool}`))

/** Вызов из ленты, о котором спрашивают: его имя, вход и вид действия. */
export const viewOf = (items: readonly FeedItem[], toolUseId: string): AcpToolView | null => {
  const item = items.find((known) => known.id === toolUseId)

  return item?.kind === 'tool' ? { name: item.name, input: item.input, action: item.action } : null
}

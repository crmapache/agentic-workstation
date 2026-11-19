import { join, isAbsolute } from 'node:path'

import type {
  Question,
  PendingRequest,
  PermissionMode,
  RequestResponse,
} from '@shared/conversation'
import type { ToolAction } from '@shared/conversation-feed'

import type { ToolContext } from '../feed/opencode-tools'
import { openCodeToolAction } from '../feed/opencode-tools'
import type { HeldRequest } from '../../agents/conversation/agent-parts'
import { hunksOfUnifiedDiff } from '../../agents/feed/unified-diff'

/**
 * Вопросы OpenCode к человеку (docs/plan-providers/40-open-models.md): разрешение
 * (`permission.asked`: действие, ресурсы, источник - вызов) и форма (`form.created`: поля) - в
 * общие вопросы панели, ответы - обратно словами OpenCode.
 */

/** Вопрос OpenCode, который держит разговор: общий вид и что нужно для ответа. */
export type OpenCodeHeld = HeldRequest & {
  source: 'permission' | 'form'
  /** id вопроса у OpenCode: `per_...` или `frm_...`. */
  openCodeId: string
  /** Сессия, которая спросила: своя или субагента - ответ уходит ей. */
  sessionId: string
  /** Действие разрешения (`edit`, `shell`) - для «разрешить в этом разговоре». */
  action: string
  /** Поля формы по тексту вопроса: ключ и вид - ответ уходит по ключу. */
  fields: Record<string, FormField>
}

/** Поле формы для ответа: ключ, вид и варианты - подпись в карточке, значение в ответе. */
type FormField = { key: string; type: string; options: { label: string; value: string }[] }

export const isOpenCodeHeld = (held: HeldRequest): held is OpenCodeHeld =>
  'openCodeId' in held && 'source' in held

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** Что вызов сделает: из ленты (по id вызова) или по самому вопросу. */
export type ToolFacts = { name: string; input: Record<string, unknown>; action: ToolAction }

/**
 * Действие по вопросу, когда вызова в ленте нет: путь, команда, адрес из ресурсов. Путь
 * OpenCode пишет от папки проекта - в карточку он идёт полным, как у вызова в ленте.
 */
const actionOfRequest = (
  action: string,
  resources: string[],
  data: Record<string, unknown>,
  root: string,
) => {
  const target = resources[0] ?? ''
  const path = target && root && !isAbsolute(target) ? join(root, target) : target
  const metadata = isRecord(data['metadata']) ? data['metadata'] : {}
  const files = (Array.isArray(metadata['files']) ? metadata['files'] : []).filter(isRecord)
  const preview = files.flatMap((file) => hunksOfUnifiedDiff(text(file, 'patch')))

  if (action === 'edit' || action === 'write') return { kind: 'edit', path, preview } as const
  if (action === 'shell' || action === 'bash') {
    return { kind: 'command', command: target, description: '' } as const
  }
  if (action === 'read') return { kind: 'read', path, line: null } as const
  if (action === 'webfetch') return { kind: 'web', target } as const

  return { kind: 'other', target, path: '' } as const
}

/**
 * Вызов коннектора, о котором спрашивают: действие - `<сервер>_<инструмент>` известного
 * сервера, вход - `metadata.input`. Так OpenCode спрашивает и о вызове изнутри кода Code Mode,
 * где источник вопроса - весь `execute`, а не этот вызов (ADR 0088).
 */
const connectorCallOf = (action: string, data: Record<string, unknown>, context: ToolContext) => {
  const metadata = isRecord(data['metadata']) ? data['metadata'] : {}
  const input = isRecord(metadata['input']) ? metadata['input'] : {}
  const called = openCodeToolAction(action, input, context)

  return called.kind === 'mcp' ? { input, action: called } : null
}

/**
 * Разрешение (`permission.asked`) - карточкой вопроса. Правка несёт готовый дифф в
 * `metadata.files`: он и показывается, даже если вызов в ленте ещё без входа. servers - имена
 * серверов коннекторов процесса: вызов коннектора карточка показывает им самим.
 */
export const holdPermission = (
  requestId: string,
  data: Record<string, unknown>,
  facts: ToolFacts | null,
  mode: PermissionMode,
  root: string,
  servers: readonly string[] = [],
): OpenCodeHeld => {
  const action = text(data, 'action')
  const resources = strings(data['resources'])
  const source = isRecord(data['source']) ? data['source'] : {}
  const fromRequest = actionOfRequest(action, resources, data, root)
  const connector = connectorCallOf(action, data, { servers, root })
  const pending: PendingRequest = {
    kind: 'permission',
    requestId,
    toolUseId: text(source, 'id'),
    toolName: connector ? action : (facts?.name ?? action),
    input: connector?.input ?? facts?.input ?? { resources },
    // Дифф правки - из вопроса: вход вызова в ленте может ещё не прийти.
    action:
      connector?.action ??
      (fromRequest.kind === 'edit' && fromRequest.preview.length > 0
        ? fromRequest
        : (facts?.action ?? fromRequest)),
    description: resources.join(', '),
    reason: text(data, 'message'),
    alwaysKind: 'rule',
    mode,
  }

  return {
    pending,
    source: 'permission',
    openCodeId: text(data, 'id'),
    sessionId: text(data, 'sessionID'),
    action,
    fields: {},
  }
}

/** Варианты поля: у выбора - его варианты, у да/нет - два своих. */
const optionsOf = (field: Record<string, unknown>) => {
  if (field['type'] === 'boolean') {
    return [
      { label: 'Yes', value: 'true', description: '' },
      { label: 'No', value: 'false', description: '' },
    ]
  }

  return (Array.isArray(field['options']) ? field['options'].filter(isRecord) : []).map(
    (option) => ({
      label: text(option, 'label') || text(option, 'value'),
      value: text(option, 'value') || text(option, 'label'),
      description: text(option, 'description'),
    }),
  )
}

/**
 * Поле формы - вопросом панели (форма 2.3.2: `{key, title, description, type, options}`).
 * Вопрос - описание поля (так пишет инструмент question), иначе заголовок; заголовок поля -
 * подписью над вопросом. Варианты есть у выбора одного (string) и нескольких (multiselect).
 */
const questionOf = (field: Record<string, unknown>): Question => {
  const type = text(field, 'type')
  const title = text(field, 'title')
  const description = text(field, 'description')
  const options = optionsOf(field).map(({ label, description: about }) => ({
    label,
    description: about,
  }))

  return {
    question: description || title || text(field, 'key'),
    header: description ? title : '',
    options,
    multiSelect: type === 'multiselect' && field['maxItems'] !== 1,
    other: options.length === 0 || field['custom'] === true,
    secret: false,
  }
}

/** Форма (`form.created`) - вопросом с вариантами; скрытые поля не спрашиваются. */
export const holdForm = (requestId: string, form: Record<string, unknown>): OpenCodeHeld => {
  const fields = (Array.isArray(form['fields']) ? form['fields'].filter(isRecord) : []).filter(
    (field) => field['hidden'] !== true,
  )
  const questions = fields.map(questionOf)

  return {
    pending: { kind: 'question', requestId, toolUseId: '', questions },
    source: 'form',
    openCodeId: text(form, 'id'),
    sessionId: text(form, 'sessionID'),
    action: '',
    fields: Object.fromEntries(
      fields.map((field, index) => [
        questions[index]?.question ?? '',
        {
          key: text(field, 'key'),
          type: text(field, 'type'),
          options: optionsOf(field).map(({ label, value }) => ({ label, value })),
        },
      ]),
    ),
  }
}

/** Ответ на разрешение словами OpenCode; «разрешить в этом разговоре» - правилом сессии. */
export const permissionReply = (response: RequestResponse): 'once' | 'reject' =>
  response.kind === 'permission' && response.decision.behavior !== 'deny' ? 'once' : 'reject'

/** Ответ формы по ключам полей: варианты - их значения, да/нет - булево, число - числом. */
export const formAnswer = (
  held: OpenCodeHeld,
  response: RequestResponse,
): Record<string, FormValue> => {
  if (response.kind !== 'question') return {}

  const answer: Record<string, FormValue> = {}

  for (const [question, value] of Object.entries(response.answers)) {
    const field = held.fields[question]

    if (field) answer[field.key] = formValue(field, value)
  }

  return answer
}

/** Значение поля формы: варианты - списком, да/нет - булево, число - числом. */
type FormValue = string | number | boolean | string[]

/** Ответ карточки - значением поля: подпись варианта - его значение, свой ответ - как есть. */
const formValue = (field: FormField, answer: string): FormValue => {
  const valueOf = (label: string) =>
    field.options.find((option) => option.label === label)?.value ?? label

  if (field.type === 'boolean') return valueOf(answer) === 'true'
  if (field.type === 'number' || field.type === 'integer') return Number(answer)
  if (field.type === 'multiselect') return answer.split(', ').filter(Boolean).map(valueOf)

  return valueOf(answer)
}

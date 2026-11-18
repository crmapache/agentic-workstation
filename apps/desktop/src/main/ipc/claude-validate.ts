import type {
  ImageAttachment,
  QuestionAnswers,
  RequestResponse,
  PermissionDecision,
  ConversationOptions,
} from '@shared/claude'
import { EFFORT_LEVELS, PERMISSION_MODES, IMAGE_MEDIA_TYPES } from '@shared/claude'
import type { RewindScope } from '@shared/claude-rewind'

import { parseEditorRef, parseMessageDraft } from '../agents/conversation/message-draft'
import type { Outgoing } from '../agents/conversation/outbox'
import { isAgentName } from '../claude/feed/fleet-transcript'
import { usableModel } from '../claude/settings/panel-prefs'
import { assertOneOf, assertString } from './validate'

/** Потолок сообщения: больше в поле не вставляют, а мусор не должен доехать до CLI. */
const MAX_TEXT_CHARS = 200_000

const asRecord = (value: unknown, name: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Ожидался объект в поле ${name}`)
  }

  return value as Record<string, unknown>
}

/** Текст сообщения человека. */
export const assertMessageText = (value: unknown): string => {
  assertString(value, 'text')

  if (value.length > MAX_TEXT_CHARS) throw new Error('Сообщение слишком длинное')

  return value
}

/**
 * Картинок в сообщении не больше двадцати (столько принимает API), каждая - до 5 МБ
 * после base64 с запасом: окно само уменьшает большие, сюда доезжает уже готовое.
 */
const MAX_IMAGES = 20
const MAX_IMAGE_CHARS = 7_500_000
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

/** UUID: id сессии становится именем файла и аргументом запуска, id сообщения - именем строки. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const assertUuid = (value: unknown, name: string): string => {
  assertString(value, name)

  if (!UUID_PATTERN.test(value)) throw new Error(`Недопустимый id в поле ${name}`)

  return value
}

export const assertSessionId = (value: unknown): string => assertUuid(value, 'sessionId')

/**
 * Имя задачи или агента CLI (task_id, agentId): буквы, цифры, дефис. agentId встаёт в путь
 * файла - разделителю и «..» там не место.
 */
export const assertCliName = (value: unknown, name: string): string => {
  assertString(value, name)

  if (!isAgentName(value)) throw new Error(`Недопустимое имя в поле ${name}`)

  return value
}

const parseImage = (value: unknown): ImageAttachment => {
  const record = asRecord(value, 'image')
  const mediaType = assertOneOf(record['mediaType'], IMAGE_MEDIA_TYPES, 'mediaType')
  const data = record['data']

  if (typeof data !== 'string' || data.length > MAX_IMAGE_CHARS || !BASE64_PATTERN.test(data)) {
    throw new Error('Недопустимая картинка')
  }

  return { mediaType, data }
}

/**
 * Сообщение человека: текст и картинки, куски для ленты и очереди, открытый файл.
 * Кусков и файла может не быть; кривые куски выбрасываются, а не роняют отправку.
 */
export const parseOutgoing = (request: {
  text: unknown
  images?: unknown
  draft?: unknown
  editor?: unknown
}): Outgoing => {
  const { text, images } = request

  if (images !== undefined && (!Array.isArray(images) || images.length > MAX_IMAGES)) {
    throw new Error('Недопустимый список картинок')
  }

  return {
    text: assertMessageText(text),
    images: (images ?? []).map(parseImage),
    draft: parseMessageDraft(request.draft),
    editor: parseEditorRef(request.editor),
  }
}

/** Сосед в очереди, перед которым встать: id или ничего. */
export const parseQueuePlace = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= 100 ? value : null

/** Номер картинки в сообщении. */
export const assertIndex = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= MAX_IMAGES) {
    throw new Error('Недопустимый номер картинки')
  }

  return value
}

/**
 * id элемента ленты: uuid сообщения, «id сообщения:номер блока», id вызова. Главный
 * процесс ищет его подстрокой в транскрипте - пустой или чужой формы id совпал бы с чем
 * угодно.
 */
const FEED_ITEM_ID_PATTERN = /^[\w-]+(?::[\w-]+)*$/
const MAX_FEED_ITEM_ID_CHARS = 200
/** Элементов за один запрос: полке закреплённых нужны единицы. */
const MAX_FEED_ITEMS = 20

export const assertFeedItemId = (value: unknown, name = 'itemId'): string => {
  assertString(value, name)

  if (value.length > MAX_FEED_ITEM_ID_CHARS || !FEED_ITEM_ID_PATTERN.test(value)) {
    throw new Error(`Недопустимый id в поле ${name}`)
  }

  return value
}

export const parseFeedItemIds = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > MAX_FEED_ITEMS) {
    throw new Error('Ожидался список id в поле itemIds')
  }

  return value.map((item) => assertFeedItemId(item, 'itemIds'))
}

/** Потолок команды «!»: это строка терминала, а не файл. */
const MAX_SHELL_CHARS = 10_000

/** Команда «!»: непустая строка без нулевого байта (он оборвал бы аргумент оболочки). */
export const assertShellCommand = (value: unknown): string => {
  assertString(value, 'command')

  if (!value.trim() || value.length > MAX_SHELL_CHARS || value.includes('\0')) {
    throw new Error('Недопустимая команда')
  }

  return value
}

export const parseRewindScope = (value: unknown): RewindScope =>
  assertOneOf(value, ['conversation', 'code', 'both'], 'scope')

const parseDecision = (value: unknown): PermissionDecision => {
  const record = asRecord(value, 'decision')
  const behavior = assertOneOf(record['behavior'], ['allow', 'allowAlways', 'deny'], 'behavior')

  if (behavior !== 'deny') return { behavior }

  const message = record['message'] ?? ''

  return { behavior, message: assertMessageText(message) }
}

const parseAnswers = (value: unknown): QuestionAnswers => {
  const record = asRecord(value, 'answers')

  return Object.fromEntries(
    Object.entries(record).map(([question, answer]) => [question, assertMessageText(answer)]),
  )
}

/** Ответ на вопрос CLI из окна - по форме контракта, без лишних полей. */
export const parseRequestResponse = (value: unknown): RequestResponse => {
  const record = asRecord(value, 'response')
  const kind = assertOneOf(record['kind'], ['permission', 'question', 'plan'], 'kind')

  if (kind === 'permission') return { kind, decision: parseDecision(record['decision']) }
  if (kind === 'question') return { kind, answers: parseAnswers(record['answers']) }

  return {
    kind,
    approved: record['approved'] === true,
    acceptEdits: record['acceptEdits'] === true,
    feedback: assertMessageText(record['feedback'] ?? ''),
  }
}

/** Новые настройки разговора: что не пришло - не меняется, null - «как в CLI». */
export const parseOptions = (value: unknown): ConversationOptions => {
  const record = asRecord(value, 'options')
  const options: ConversationOptions = {}

  if ('model' in record) {
    const model = record['model']

    // Те же правила, что у своих моделей (прокси, шлюз): имя уходит аргументом запуска.
    if (model !== null && (typeof model !== 'string' || usableModel(model) !== model)) {
      throw new Error('Недопустимое имя модели')
    }

    options.model = model
  }

  if ('effort' in record) {
    options.effort =
      record['effort'] === null ? null : assertOneOf(record['effort'], EFFORT_LEVELS, 'effort')
  }

  if ('permissionMode' in record) {
    options.permissionMode = assertOneOf(
      record['permissionMode'],
      PERMISSION_MODES,
      'permissionMode',
    )
  }

  if ('fastMode' in record) {
    if (typeof record['fastMode'] !== 'boolean') throw new Error('Ожидалось да или нет: fastMode')

    options.fastMode = record['fastMode']
  }

  return options
}

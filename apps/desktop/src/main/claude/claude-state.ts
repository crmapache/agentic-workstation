import { isAbsolute } from 'node:path'

import type { ForkOrigin, TurnOutcome, QueuedMessage, PermissionMode } from '@shared/conversation'
import { EFFORT_LEVELS, TITLE_SOURCES, PERMISSION_MODES } from '@shared/conversation'

import { parseMessageDraft } from '../agents/conversation/message-draft'
import { parseClosed } from '../agents/panel/closed-tabs'
import type { StoredPanel, StoredContext, StoredConversation } from '../agents/panel/panel-state'
import type { PrefsRules } from './settings/panel-prefs'
import { parsePanelPrefs } from './settings/panel-prefs'

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const parseFork = (value: unknown): ForkOrigin | null => {
  if (typeof value !== 'object' || value === null) return null

  const record = value as Record<string, unknown>
  const sourceSessionId = text(record['sourceSessionId'])
  const at = text(record['at'])

  return sourceSessionId && at
    ? {
        sourceSessionId,
        at,
        sourceTitle: text(record['sourceTitle']),
        ...(record['whole'] === true && { whole: true }),
      }
    : null
}

const parseQueue = (value: unknown): QueuedMessage[] =>
  Array.isArray(value)
    ? value.flatMap((item: unknown) => {
        if (typeof item !== 'object' || item === null) return []

        const record = item as Record<string, unknown>
        const id = text(record['id'])
        const message = text(record['text'])

        // Картинки очереди живут в памяти и перезапуск не переживают: на диске текст и куски.
        return id && message
          ? [{ id, text: message, imageCount: 0, draft: parseMessageDraft(record['draft']) }]
          : []
      })
    : []

/** Как читать вкладки файла: уровни усилия провайдера и можно ли вкладке быть без id сессии. */
/** Что провайдер принимает с диска: уровни, режимы, разговоры без id сессии (Codex). */
type ParseRules = PrefsRules & { sessionless: boolean }

/** Режим с диска - из режимов провайдера; старое «manual» - это «спрашивать». */
const modeOf = (value: unknown, modes: readonly PermissionMode[]): PermissionMode =>
  modes.find((mode) => mode === (value === 'manual' ? 'default' : value)) ?? 'default'

const parseConversation = (value: unknown, rules: ParseRules): StoredConversation | null => {
  if (typeof value !== 'object' || value === null) return null

  const record = value as Record<string, unknown>
  const id = text(record['id'])
  const projectPath = text(record['projectPath'])
  const sessionId = text(record['sessionId'])

  if (!id || !projectPath || (!sessionId && !rules.sessionless)) return null

  const effort = rules.efforts.find((level) => level === record['effort']) ?? null
  const permissionMode = modeOf(record['permissionMode'], rules.modes)

  return {
    id,
    projectPath,
    sessionId,
    title: text(record['title']),
    model: text(record['model']) || null,
    effort,
    permissionMode,
    queue: parseQueue(record['queue']),
    fork: parseFork(record['fork']),
    updatedAt: typeof record['updatedAt'] === 'number' ? record['updatedAt'] : 0,
    ...parseTabFields(record),
  }
}

/** Ранг имени, группа и итог хода; нет в файле - умолчания freshConversation. */
const parseTabFields = (record: Record<string, unknown>) => ({
  titleSource: TITLE_SOURCES.find((source) => source === record['titleSource']),
  groupId: text(record['groupId']) || undefined,
  depth: Number.isInteger(record['depth']) ? Math.max(0, record['depth'] as number) : undefined,
  outcome: typeof record['outcome'] === 'string' ? toOutcome(record['outcome']) : undefined,
  fastMode: typeof record['fastMode'] === 'boolean' ? record['fastMode'] : undefined,
  context: parseContext(record['context']),
})

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0

/** Цифры контекста с диска: без окна они ничего не говорят - их нет. */
const parseContext = (value: unknown): StoredContext | undefined => {
  if (typeof value !== 'object' || value === null) return undefined

  const record = value as Record<string, unknown>
  const window = count(record['window'])

  return window > 0 ? { tokens: count(record['tokens']), window } : undefined
}

const toOutcome = (value: string): TurnOutcome => (value === 'none' ? 'none' : 'done')

/** Сохранённое состояние с диска. Битое или чужое - пустое, а не падение IDE. */
/**
 * Файл панели. rules - уровни усилия провайдера (у Codex свои: чужой уровень на диске - «по
 * умолчанию», а не отказ всего файла) и вкладки без id сессии (у Codex id потока даёт сервер
 * на первом ходе - новая вкладка до него без id).
 */
export const parseStoredClaude = (
  value: unknown,
  rules: ParseRules = { efforts: EFFORT_LEVELS, modes: PERMISSION_MODES, sessionless: false },
): StoredPanel => {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const conversations = Array.isArray(record['conversations'])
    ? record['conversations']
        .map((item) => parseConversation(item, rules))
        .filter((item): item is StoredConversation => item !== null)
    : []
  const active =
    typeof record['activeByProject'] === 'object' && record['activeByProject'] !== null
      ? (record['activeByProject'] as Record<string, unknown>)
      : {}
  const ids = new Set(conversations.map((conversation) => conversation.id))
  const activeByProject = Object.fromEntries(
    Object.entries(active).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && ids.has(entry[1]),
    ),
  )

  const trusted = record['trustedProjects']
  const trustedProjects = Array.isArray(trusted)
    ? trusted.filter((path): path is string => typeof path === 'string' && isAbsolute(path))
    : []

  return {
    conversations,
    closed: parseClosed(record['closed'], (item) => parseConversation(item, rules)),
    activeByProject,
    trustedProjects,
    prefs: parsePanelPrefs(record['prefs'], rules),
    commandsByProject: parseCommandNames(record['commandsByProject']),
  }
}

/** Имена команд по папке проекта: чужое и битое - мимо, папка - только абсолютный путь. */
const parseCommandNames = (value: unknown): Record<string, string[]> => {
  if (typeof value !== 'object' || value === null) return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        (entry): entry is [string, unknown[]] => isAbsolute(entry[0]) && Array.isArray(entry[1]),
      )
      .map(([path, names]) => [
        path,
        names.filter((name): name is string => typeof name === 'string' && name.length > 0),
      ]),
  )
}

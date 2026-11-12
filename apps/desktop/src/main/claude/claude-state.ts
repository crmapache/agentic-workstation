import { isAbsolute } from 'node:path'

import type {
  ForkOrigin,
  TitleSource,
  TurnOutcome,
  Conversation,
  QueuedMessage,
  PermissionMode,
} from '@shared/claude'
import { EFFORT_LEVELS, TITLE_SOURCES } from '@shared/claude'
import type { PanelPrefs } from '@shared/claude-prefs'

import { parseMessageDraft } from './conversation/message-draft'
import { toPanelMode } from './settings/default-mode'
import { parsePanelPrefs } from './settings/panel-prefs'
import type { ClosedTab } from './tabs/closed-tabs'
import { parseClosed } from './tabs/closed-tabs'

/**
 * Что о разговоре хранится на диске: остальное живёт, пока жив процесс. Очередь -
 * тоже: в ней бывают сообщения, которые так и не ушли, а поле ввода их уже отдало.
 */
export type StoredConversation = Pick<
  Conversation,
  | 'id'
  | 'projectPath'
  | 'sessionId'
  | 'title'
  | 'model'
  | 'effort'
  | 'permissionMode'
  | 'queue'
  | 'fork'
  | 'updatedAt'
> &
  StoredTabFields

/** Поля вкладки моложе файла: в старом файле их нет, умолчания - во freshConversation. */
type StoredTabFields = {
  titleSource?: TitleSource | undefined
  groupId?: string | undefined
  depth?: number | undefined
  /** На диске - был ли хоть один ход: ошибка и поломка процесса перезапуск не переживают. */
  outcome?: TurnOutcome | undefined
  /** Быстрый режим ездит с разговором (а новая вкладка стартует без него). */
  fastMode?: boolean | undefined
  /**
   * Контекст на последнем известном шаге: вернувшаяся вкладка с длинным разговором не
   * стоит на «ctx 0%», пока процесс не поднят. Без окна цифры не пишутся.
   */
  context?: StoredContext | undefined
}

/** Занятое и окно контекста на диске. */
type StoredContext = { tokens: number; window: number }

export type StoredClaude = {
  /** В порядке полосы вкладок. */
  conversations: StoredConversation[]
  /** Закрытые человеком вкладки всех проектов: вернуть их можно и после перезапуска. */
  closed: ClosedTab[]
  activeByProject: Record<string, string>
  /** Папки, которым человек доверился в панели (WorkspaceTrust). */
  trustedProjects: string[]
  /** Настройки панели (экран Settings). */
  prefs: PanelPrefs
  /** Имена команд, которые CLI назвал последними, - по папке проекта (cli/project-commands.ts). */
  commandsByProject: Record<string, string[]>
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** Новая вкладка разговора со свежими полями хода. */
export const freshConversation = (stored: StoredConversation): Conversation => ({
  ...stored,
  // Вкладка из старого файла: имя было у разговора, который уже шёл, - его дала модель.
  titleSource: stored.titleSource ?? (stored.title ? 'llm' : 'default'),
  groupId: stored.groupId ?? stored.id,
  depth: stored.depth ?? 0,
  // Ошибка и поломка процесса перезапуск не переживают: процесса того уже нет.
  outcome: (stored.outcome ?? (stored.title ? 'done' : 'none')) === 'none' ? 'none' : 'done',
  backgroundWork: false,
  status: 'idle',
  activeModel: null,
  usage: {
    contextTokens: stored.context?.tokens ?? 0,
    contextWindow: stored.context?.window ?? 0,
  },
  pending: null,
  pendingCount: 0,
  turnStartedAt: null,
  stopRequestedAt: null,
  workStartedAt: null,
  workPausedMs: 0,
  error: null,
})

export const toStored = (conversation: Conversation): StoredConversation => ({
  id: conversation.id,
  projectPath: conversation.projectPath,
  sessionId: conversation.sessionId,
  title: conversation.title,
  titleSource: conversation.titleSource,
  groupId: conversation.groupId,
  depth: conversation.depth,
  outcome: conversation.outcome,
  model: conversation.model,
  effort: conversation.effort,
  permissionMode: conversation.permissionMode,
  queue: conversation.queue.map((item) => ({ ...item, imageCount: 0 })),
  fork: conversation.fork,
  updatedAt: conversation.updatedAt,
  ...(conversation.fastMode && { fastMode: true }),
  ...(conversation.usage.contextWindow > 0 && {
    context: { tokens: conversation.usage.contextTokens, window: conversation.usage.contextWindow },
  }),
})

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

const parseConversation = (value: unknown): StoredConversation | null => {
  if (typeof value !== 'object' || value === null) return null

  const record = value as Record<string, unknown>
  const id = text(record['id'])
  const projectPath = text(record['projectPath'])
  const sessionId = text(record['sessionId'])

  if (!id || !projectPath || !sessionId) return null

  const effort = EFFORT_LEVELS.find((level) => level === record['effort']) ?? null
  const permissionMode: PermissionMode = toPanelMode(record['permissionMode']) ?? 'default'

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
  fastMode: record['fastMode'] === true || undefined,
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
export const parseStoredClaude = (value: unknown): StoredClaude => {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const conversations = Array.isArray(record['conversations'])
    ? record['conversations']
        .map(parseConversation)
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
    closed: parseClosed(record['closed'], parseConversation),
    activeByProject,
    trustedProjects,
    prefs: parsePanelPrefs(record['prefs']),
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

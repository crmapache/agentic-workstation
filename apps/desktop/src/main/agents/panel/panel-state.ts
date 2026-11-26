import type { TitleSource, TurnOutcome, Conversation } from '@shared/conversation'
import type { PanelPrefs } from '@shared/panel-prefs'

import type { ClosedTab } from './closed-tabs'

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
  /** Закреплена (зона закреплённых в начале полосы); нет - нет. */
  pinned?: boolean | undefined
  /**
   * Контекст на последнем известном шаге: вернувшаяся вкладка с длинным разговором не
   * стоит на «ctx 0%», пока процесс не поднят. Без окна цифры не пишутся.
   */
  context?: StoredContext | undefined
}

/** Занятое и окно контекста на диске. */
export type StoredContext = { tokens: number; window: number }

export type StoredPanel = {
  /** В порядке полосы вкладок. */
  conversations: StoredConversation[]
  /** Закрытые человеком вкладки всех проектов: вернуть их можно и после перезапуска. */
  closed: ClosedTab[]
  activeByProject: Record<string, string>
  /** Настройки панели (экран Settings). */
  prefs: PanelPrefs
  /** Имена команд, которые CLI назвал последними, - по папке проекта (cli/project-commands.ts). */
  commandsByProject: Record<string, string[]>
}

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
  // Просьба «выключить» тоже хранится: у Codex она перебивает уровень из его настроек.
  ...(conversation.fastMode !== undefined && { fastMode: conversation.fastMode }),
  ...(conversation.pinned === true && { pinned: true }),
  ...(conversation.usage.contextWindow > 0 && {
    context: { tokens: conversation.usage.contextTokens, window: conversation.usage.contextWindow },
  }),
})

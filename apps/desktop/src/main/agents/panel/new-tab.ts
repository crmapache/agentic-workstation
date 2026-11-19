import { randomUUID } from 'node:crypto'

import type { ForkOrigin, TitleSource, Conversation, PermissionMode } from '@shared/conversation'
import type { PanelPrefs } from '@shared/panel-prefs'

import { freshConversation } from './panel-state'

/** Имя прошлого разговора из журнала провайдера с его рангом; null - имени нет. */
export type HistoryName = { title: string; source: TitleSource } | null

/** Из чего рождается вкладка: разговор, имя из журнала и на кого она похожа. */
export type NewTab = {
  projectPath: string
  sessionId: string
  /** Имя прошлого разговора с его рангом; null - новый разговор, имени ещё нет. */
  name: HistoryName
  /** Источник форка: форк встаёт в его группу на ступень глубже и продолжает его настройки. */
  base?: Conversation | undefined
  fork: ForkOrigin | null
  /** Выбранная вкладка проекта: новая наследует её модель, усилие и режим. */
  current: Conversation | undefined
  prefs: PanelPrefs
  /** Режим, когда его не дали ни закреплённые настройки, ни соседняя вкладка, - по провайдеру. */
  defaultMode: (projectPath: string) => Promise<PermissionMode>
}

/**
 * Новая вкладка разговора. Модель, усилие и режим - закреплённые в Settings → New chats,
 * иначе как у выбранной вкладки проекта; форк продолжает свой источник, и закреплённое
 * его не перебивает.
 */
export const newTabConversation = async (tab: NewTab): Promise<Conversation> => {
  const { projectPath, base, name } = tab
  const current = base ?? tab.current
  const pinned = base ? null : tab.prefs
  const id = randomUUID()
  const permissionMode =
    pinned?.newTabMode ?? current?.permissionMode ?? (await tab.defaultMode(projectPath))

  return freshConversation({
    id,
    projectPath,
    sessionId: tab.sessionId,
    title: name?.title ?? '',
    titleSource: name?.source ?? 'default',
    groupId: base?.groupId ?? id,
    depth: base ? base.depth + 1 : 0,
    model: pinned?.newTabModel ?? current?.model ?? null,
    effort: pinned?.newTabEffort ?? current?.effort ?? null,
    permissionMode,
    queue: [],
    fork: tab.fork,
    updatedAt: Date.now(),
    // Быстрый режим платный: новая вкладка без просьбы, форк продолжает просьбу источника.
    ...(base?.fastMode !== undefined && { fastMode: base.fastMode }),
  })
}

import type {
  ModelInfo,
  ClaudeState,
  Conversation,
  RefusedModes,
  SlashCommand,
} from '@shared/claude'
import type { ConversationFeed } from '@shared/claude-feed'
import type { PanelPrefs } from '@shared/claude-prefs'
import { DEFAULT_PANEL_PREFS } from '@shared/claude-prefs'
import type { WorkspaceState } from '@shared/workspace'
import { useQuery, queryOptions, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { QUERY_KEYS } from '../../state/query-keys'
import { useActiveProject } from '../../state/workspace.queries'
import { touchesFiles, applyFeedPatch, finishedTurnProjects } from './claude.utils'
import { useCallSounds } from './sounds.hooks'
import { useTabCallsSync } from './tab-calls.hooks'

/**
 * Разговоры Claude Code во всех проектах. Владелец - главный процесс; здесь зеркало
 * под одним ключом: первый запрос, ответы на действия и событие claude:state пишут
 * туда же.
 */
const claudeStateQuery = queryOptions({
  queryKey: QUERY_KEYS.claudeState,
  queryFn: () => invoke('claude:getState'),
  staleTime: Infinity,
})

const NO_MODELS: readonly ModelInfo[] = []

const NO_COMMANDS: readonly SlashCommand[] = []

const NO_REFUSALS: RefusedModes = { bypass: false, autoModels: [] }

export const useClaudeState = () => useQuery(claudeStateQuery)

/**
 * Каталог моделей CLI; пусто, пока CLI не ответил. Выборка из того же кэша:
 * компонент перерисовывается, только когда поменялся сам каталог.
 */
export const useModelCatalog = (): readonly ModelInfo[] =>
  useQuery({ ...claudeStateQuery, select: (state) => state.models }).data ?? NO_MODELS

/**
 * Настройки панели (Settings). Пока главный процесс не ответил - по умолчанию: поле и
 * строка под ним рисуются сразу, а не после первого ответа.
 */
export const usePanelPrefs = (): PanelPrefs =>
  useQuery({ ...claudeStateQuery, select: (state) => state.prefs }).data ?? DEFAULT_PANEL_PREFS

/** Режимы, в которые CLI отказался переходить: Shift+Tab и меню MODE их пропускают. */
export const useRefusedModes = (): RefusedModes =>
  useQuery({ ...claudeStateQuery, select: (state) => state.refusedModes }).data ?? NO_REFUSALS

/**
 * Свои команды CLI (/compact, /clear…) - служебным запросом при старте IDE, без разговора;
 * пусто, пока CLI не ответил.
 */
export const useBuiltinCommands = (): readonly SlashCommand[] =>
  useQuery({ ...claudeStateQuery, select: (state) => state.builtinCommands }).data ?? NO_COMMANDS

/**
 * Слэш-команды, которые CLI сообщил для проекта; с прошлого запуска IDE - именами, пусто,
 * пока процесс проекта ни разу не поднимался.
 */
export const useSlashCommands = (projectPath: string): readonly SlashCommand[] =>
  useQuery({ ...claudeStateQuery, select: (state) => state.commandsByProject[projectPath] }).data ??
  NO_COMMANDS

/** Разговоры активного проекта по порядку вкладок и выбранный из них. */
export const useProjectConversations = () => {
  const project = useActiveProject()
  const { data: state } = useClaudeState()
  const path = project?.rootPath
  const conversations = state?.conversations.filter((item) => item.projectPath === path) ?? []
  const activeId = path ? state?.activeByProject[path] : undefined
  const active: Conversation | null =
    conversations.find((item) => item.id === activeId) ?? conversations.at(-1) ?? null

  return { project, state, conversations, active }
}

/** Лента разговора. Живые изменения дописывает useClaudeSync, перезапроса нет. */
export const useConversationFeed = (conversationId: string | undefined) =>
  useQuery({
    queryKey: QUERY_KEYS.claudeFeed(conversationId ?? ''),
    queryFn: () => invoke('claude:getFeed', { conversationId: conversationId ?? '' }),
    enabled: Boolean(conversationId),
    staleTime: Infinity,
  })

/**
 * Картинка сообщения целиком (data URL) - только когда её открыли: в ленте одни
 * миниатюры. index null - ничего не открыто.
 */
export const useMessageImage = (conversationId: string, messageId: string, index: number | null) =>
  useQuery({
    queryKey: QUERY_KEYS.claudeImage(conversationId, messageId, index ?? -1),
    queryFn: () => invoke('claude:getImage', { conversationId, messageId, index: index ?? 0 }),
    enabled: index !== null,
    staleTime: Infinity,
  })

/** Что вернёт откат кода к сообщению: CLI спрашивается, пока открыт диалог отката. */
export const useRewindPreview = (conversationId: string, messageId: string) =>
  useQuery({
    queryKey: QUERY_KEYS.claudeRewindPreview(conversationId, messageId),
    queryFn: () => invoke('claude:previewRewind', { conversationId, messageId }),
    staleTime: 0,
    gcTime: 0,
  })

/** Прошлые разговоры проекта - для меню истории, читаются при каждом открытии. */
export const useConversationHistory = (projectId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: QUERY_KEYS.claudeHistory(projectId ?? ''),
    queryFn: () => invoke('claude:listHistory', { projectId: projectId ?? '' }),
    enabled: enabled && Boolean(projectId),
    staleTime: 0,
  })

/**
 * Держит кэш разговоров и лент в синхроне с главным процессом. Лента, которую окно ещё
 * не запрашивало, не заводится из патча: её целиком отдаст первый запрос.
 */
export const useClaudeSync = () => {
  const queryClient = useQueryClient()

  // Разговор позвал человека - звук (настройки IDE, Settings → Sounds).
  useCallSounds()
  // И свет позвавшей вкладки цветом повода - пока её не откроют.
  useTabCallsSync()

  /** Перечитать дерево проекта: файлы поменялись мимо дерева (слежения за диском нет). */
  const refreshTree = (projectPath: string) => {
    const workspace = queryClient.getQueryData<WorkspaceState>(QUERY_KEYS.workspace)
    const project = workspace?.projects.find((item) => item.rootPath === projectPath)

    if (project) {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.projectDirectories(project.id) })
    }
  }

  useIpcEvent('claude:state', (state) => {
    const previous = queryClient.getQueryData<ClaudeState>(QUERY_KEYS.claudeState)

    queryClient.setQueryData<ClaudeState>(QUERY_KEYS.claudeState, state)

    // Ход кончился - модель могла создать и удалить файлы: дерево проекта перечитывается.
    for (const path of finishedTurnProjects(previous, state)) refreshTree(path)
  })

  useIpcEvent('claude:feed', (patch) => {
    queryClient.setQueryData<ConversationFeed>(
      QUERY_KEYS.claudeFeed(patch.conversationId),
      (feed) => (feed ? applyFeedPatch(feed, patch) : feed),
    )

    // Откат файлов, откат разговора с кодом, отработавшая команда «!» тоже трогают диск.
    if (touchesFiles(patch)) {
      const state = queryClient.getQueryData<ClaudeState>(QUERY_KEYS.claudeState)
      const conversation = state?.conversations.find((item) => item.id === patch.conversationId)

      if (conversation) refreshTree(conversation.projectPath)
    }
  })
}

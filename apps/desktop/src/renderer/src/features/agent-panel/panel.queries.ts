import type {
  ModelInfo,
  EffortLevel,
  Conversation,
  RefusedModes,
  SlashCommand,
  AgentPanelState,
} from '@shared/conversation'
import type { ConversationFeed } from '@shared/conversation-feed'
import type { PanelCapabilities } from '@shared/panel-capabilities'
import { capabilitiesOf } from '@shared/panel-capabilities'
import type { PanelPrefs } from '@shared/panel-prefs'
import { DEFAULT_PANEL_PREFS } from '@shared/panel-prefs'
import type { ProviderId } from '@shared/providers'
import type { WorkspaceState } from '@shared/workspace'
import type { UseQueryResult } from '@tanstack/react-query'
import { useQuery, useQueries, queryOptions, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { applyFeedPatch } from '../../state/feed-patch.utils'
import { PANEL_PROVIDERS } from '../../state/layout.constants'
import { usePanelProvider } from '../../state/panel-provider.context'
import { QUERY_KEYS } from '../../state/query-keys'
import { useActiveProject } from '../../state/workspace.queries'
import { effortLevels } from './models.utils'
import { touchesFiles, finishedTurnProjects } from './panel.utils'
import { useCallSounds } from './sounds.hooks'
import { useTabCallsSync } from './tab-calls.hooks'

/**
 * Разговоры панели провайдера во всех проектах (ADR 0083). Владелец - главный процесс;
 * здесь зеркало под ключом провайдера: первый запрос, ответы на действия и событие
 * agent:state пишут туда же.
 */
const panelStateQuery = (provider: ProviderId) =>
  queryOptions({
    queryKey: QUERY_KEYS.agentState(provider),
    queryFn: () => invoke('agent:getState', { provider }),
    staleTime: Infinity,
  })

const NO_MODELS: readonly ModelInfo[] = []

const NO_COMMANDS: readonly SlashCommand[] = []

const NO_REFUSALS: RefusedModes = { bypass: false, autoModels: [] }

export const usePanelState = () => useQuery(panelStateQuery(usePanelProvider()))

const allConversations = (results: UseQueryResult<AgentPanelState>[]): Conversation[] =>
  results.flatMap((result) => result.data?.conversations ?? [])

/**
 * Разговоры всех панелей провайдеров - тому, что видит проект целиком (точки зова и знак работы
 * на вкладках проектов): разговор Codex зовёт и работает так же, как разговор Claude.
 */
export const useAllConversations = (): Conversation[] =>
  useQueries({ queries: PANEL_PROVIDERS.map(panelStateQuery), combine: allConversations })

/**
 * Каталог моделей CLI; пусто, пока CLI не ответил. Выборка из того же кэша:
 * компонент перерисовывается, только когда поменялся сам каталог.
 */
export const useModelCatalog = (): readonly ModelInfo[] =>
  useQuery({ ...panelStateQuery(usePanelProvider()), select: (state) => state.models }).data ??
  NO_MODELS

/**
 * Настройки панели (Settings). Пока главный процесс не ответил - по умолчанию: поле и
 * строка под ним рисуются сразу, а не после первого ответа.
 */
export const usePanelPrefs = (): PanelPrefs =>
  useQuery({ ...panelStateQuery(usePanelProvider()), select: (state) => state.prefs }).data ??
  DEFAULT_PANEL_PREFS

/**
 * Что умеет провайдер панели (ADR 0083): окно показывает кнопку, экран или команду, только
 * если он их объявил. Пока главный процесс не ответил - то, что он объявит, из общего списка.
 */
export const usePanelCapabilities = (): PanelCapabilities => {
  const provider = usePanelProvider()

  return (
    useQuery({ ...panelStateQuery(provider), select: (state) => state.capabilities }).data ??
    capabilitiesOf(provider)
  )
}

/** Уровни усилия модели разговора у провайдера панели, сильнейший первым. */
export const useEffortLevels = (model: string | null): EffortLevel[] =>
  effortLevels(useModelCatalog(), model, usePanelCapabilities().efforts)

/** Режимы, в которые CLI отказался переходить: Shift+Tab и меню MODE их пропускают. */
export const useRefusedModes = (): RefusedModes =>
  useQuery({ ...panelStateQuery(usePanelProvider()), select: (state) => state.refusedModes })
    .data ?? NO_REFUSALS

/**
 * Свои команды CLI (/compact, /clear…) - служебным запросом при старте IDE, без разговора;
 * пусто, пока CLI не ответил.
 */
export const useBuiltinCommands = (): readonly SlashCommand[] =>
  useQuery({ ...panelStateQuery(usePanelProvider()), select: (state) => state.builtinCommands })
    .data ?? NO_COMMANDS

/**
 * Слэш-команды, которые CLI сообщил для проекта; с прошлого запуска IDE - именами, пусто,
 * пока процесс проекта ни разу не поднимался.
 */
export const useSlashCommands = (projectPath: string): readonly SlashCommand[] =>
  useQuery({
    ...panelStateQuery(usePanelProvider()),
    select: (state) => state.commandsByProject[projectPath],
  }).data ?? NO_COMMANDS

/** Разговоры активного проекта по порядку вкладок и выбранный из них. */
export const useProjectConversations = () => {
  const project = useActiveProject()
  const { data: state } = usePanelState()
  const path = project?.rootPath
  const conversations = state?.conversations.filter((item) => item.projectPath === path) ?? []
  const activeId = path ? state?.activeByProject[path] : undefined
  const active: Conversation | null =
    conversations.find((item) => item.id === activeId) ?? conversations.at(-1) ?? null

  return { project, state, conversations, active }
}

/** Лента разговора. Живые изменения дописывает usePanelsSync, перезапроса нет. */
export const useConversationFeed = (conversationId: string | undefined) => {
  const provider = usePanelProvider()

  return useQuery({
    queryKey: QUERY_KEYS.agentFeed(provider, conversationId ?? ''),
    queryFn: () => invoke('agent:getFeed', { provider, conversationId: conversationId ?? '' }),
    enabled: Boolean(conversationId),
    staleTime: Infinity,
  })
}

/** Что вернёт откат кода к сообщению: CLI спрашивается, пока открыт диалог отката. */
export const useRewindPreview = (conversationId: string, messageId: string) => {
  const provider = usePanelProvider()

  return useQuery({
    queryKey: QUERY_KEYS.agentRewindPreview(provider, conversationId, messageId),
    queryFn: () => invoke('agent:previewRewind', { provider, conversationId, messageId }),
    staleTime: 0,
    gcTime: 0,
  })
}

/** Прошлые разговоры проекта - для меню истории, читаются при каждом открытии. */
export const useConversationHistory = (projectId: string | undefined, enabled: boolean) => {
  const provider = usePanelProvider()

  return useQuery({
    queryKey: QUERY_KEYS.agentHistory(provider, projectId ?? ''),
    queryFn: () => invoke('agent:listHistory', { provider, projectId: projectId ?? '' }),
    enabled: enabled && Boolean(projectId),
    staleTime: 0,
  })
}

/**
 * Держит кэш разговоров и лент всех панелей провайдеров в синхроне с главным процессом:
 * событие несёт провайдера, кэш - его ключ. Лента, которую окно ещё
 * не запрашивало, не заводится из патча: её целиком отдаст первый запрос.
 */
export const usePanelsSync = () => {
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

  useIpcEvent('agent:state', ({ provider, state }) => {
    const previous = queryClient.getQueryData<AgentPanelState>(QUERY_KEYS.agentState(provider))

    queryClient.setQueryData<AgentPanelState>(QUERY_KEYS.agentState(provider), state)

    // Ход кончился - модель могла создать и удалить файлы: дерево проекта перечитывается.
    for (const path of finishedTurnProjects(previous, state)) refreshTree(path)
  })

  useIpcEvent('agent:feed', ({ provider, patch }) => {
    queryClient.setQueryData<ConversationFeed>(
      QUERY_KEYS.agentFeed(provider, patch.conversationId),
      (feed) => (feed ? applyFeedPatch(feed, patch) : feed),
    )

    // Откат файлов, откат разговора с кодом, отработавшая команда «!» тоже трогают диск.
    if (touchesFiles(patch)) {
      const state = queryClient.getQueryData<AgentPanelState>(QUERY_KEYS.agentState(provider))
      const conversation = state?.conversations.find((item) => item.id === patch.conversationId)

      if (conversation) refreshTree(conversation.projectPath)
    }
  })
}

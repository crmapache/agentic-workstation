import type { ConversationFeed } from '@shared/claude-feed'
import type { ComputerPermission } from '@shared/computer'
import type { ConnectorAvailability } from '@shared/connector-availability'
import type { GenerateConnectorRequest } from '@shared/connector-spec'
import type {
  AgentApp,
  ConnectorsState,
  AddToTypeRequest,
  UpdateTypeRequest,
  ConnectorInProject,
  AddConnectorRequest,
} from '@shared/connectors'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { applyFeedPatch } from './feed-patch.utils'
import { QUERY_KEYS } from './query-keys'

/** Коннекторы к приложениям (ADR 0028). Владелец - главный процесс, здесь зеркало. */
export const useConnectors = () =>
  useQuery({
    queryKey: QUERY_KEYS.connectors,
    queryFn: () => invoke('connectors:get'),
    staleTime: Infinity,
  })

/**
 * Приложения ИИ на этом Mac, которым можно отдать настройку в браузере. Своего события нет:
 * приложение ставят вне IDE, поэтому список свежий на каждый показ, а не навсегда.
 */
export const useAgentApps = () =>
  useQuery({
    queryKey: QUERY_KEYS.connectorAgentApps,
    queryFn: () => invoke('connectors:agentApps'),
  })

/**
 * Вход кончился в браузере, сервис ответил - главный процесс шлёт состояние целиком. Лента
 * работы ИИ - патчами поверх снимка в кэше; ленту, которую окно не запрашивало, патч не заводит.
 */
export const useConnectorsSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('connectors:state', (state) => {
    queryClient.setQueryData(QUERY_KEYS.connectors, state)
  })

  useIpcEvent('connectors:aiJobPatch', ({ jobId, patch }) => {
    queryClient.setQueryData<ConversationFeed | null>(
      QUERY_KEYS.connectorAiJobFeed(jobId),
      (feed) => (feed ? applyFeedPatch(feed, patch) : feed),
    )
  })
}

/**
 * Действия с коннекторами. Каждый ответ - новое состояние, оно сразу в кэше. Добавление и
 * импорт клиента Google отвечают ещё и причиной отказа - её показывает форма.
 */
export const useConnectorActions = () => {
  const queryClient = useQueryClient()
  const keep = (state: ConnectorsState) => queryClient.setQueryData(QUERY_KEYS.connectors, state)
  const act = useMutation({
    mutationFn: (run: () => Promise<ConnectorsState>) => run(),
    onSuccess: keep,
  })
  const run = (call: () => Promise<ConnectorsState>) => act.mutate(call)

  return {
    add: async (request: AddConnectorRequest) => {
      const outcome = await invoke('connectors:add', request)

      keep(outcome.state)

      return outcome
    },
    importGoogleApp: async () => {
      const outcome = await invoke('connectors:importGoogleApp')

      keep(outcome.state)

      return outcome.error
    },
    /** Ещё одно подключение своего типа: ответ с причиной отказа, как у add. */
    addToType: async (request: AddToTypeRequest) => {
      const outcome = await invoke('connectors:addToType', request)

      keep(outcome.state)

      return outcome
    },
    removeType: (typeId: string) => run(() => invoke('connectors:removeType', { typeId })),
    updateType: (request: UpdateTypeRequest) => run(() => invoke('connectors:updateType', request)),
    remove: (id: string) => run(() => invoke('connectors:remove', { id })),
    signIn: (id: string) => run(() => invoke('connectors:signIn', { id })),
    cancelSignIn: (id: string) => run(() => invoke('connectors:cancelSignIn', { id })),
    signOut: (id: string) => run(() => invoke('connectors:signOut', { id })),
    refresh: (id: string) => run(() => invoke('connectors:refresh', { id })),
    /** Новый ключ своего MCP. Отказ главного процесса - false: форма скажет об этом. */
    setToken: async (id: string, token: string): Promise<boolean> => {
      try {
        keep(await invoke('connectors:setToken', { id, token }))

        return true
      } catch {
        return false
      }
    },
    setEnabled: (id: string, enabled: boolean) =>
      run(() => invoke('connectors:setEnabled', { id, enabled })),
    setToolEnabled: (id: string, tool: string, enabled: boolean) =>
      run(() => invoke('connectors:setToolEnabled', { id, tool, enabled })),
    forgetGoogleApp: () => run(() => invoke('connectors:forgetGoogleApp')),
    /**
     * Описание человека. Ответ кладётся в кэш напрямую, без мутации: окно сохраняет его и
     * при закрытии, когда того, кто позвал, уже нет.
     */
    setDescription: async (id: string, description: string) => {
      try {
        keep(await invoke('connectors:setDescription', { id, description }))
      } catch (error) {
        console.warn('[connectors] описание не сохранилось', error)
      }
    },
    /**
     * Инструкции и профиль Chrome коннектора в проекте (ADR 0053) - как описание: ответ сразу в
     * кэш, окно сохраняет и при закрытии.
     */
    setInProject: async (id: string, projectPath: string, settings: ConnectorInProject) => {
      try {
        keep(await invoke('connectors:setInProject', { id, projectPath, settings }))
      } catch (error) {
        console.warn('[connectors] настройки проекта не сохранились', error)
      }
    },
    setAvailability: (id: string, availability: ConnectorAvailability) =>
      run(() => invoke('connectors:setAvailability', { id, availability })),
    importCandidates: () => invoke('connectors:importCandidates'),
    importServers: async (keys: string[]) => {
      const outcome = await invoke('connectors:import', { keys })

      keep(outcome.state)

      return outcome
    },
    /** Новая работа ИИ - минуты: идёт в главном процессе, ход - событиями (ADR 0050). */
    startAiJob: (request: GenerateConnectorRequest) =>
      run(() => invoke('connectors:startAiJob', request)),
    /** Слова человека ИИ: посреди хода он подхватит их, после - начнёт новый ход. */
    tellAiJob: (id: string, text: string) =>
      run(() => invoke('connectors:tellAiJob', { id, text })),
    stopAiJob: (id: string) => run(() => invoke('connectors:stopAiJob', { id })),
    /** Забыть работу: коннектор добавлен или больше не нужен. */
    removeAiJob: (id: string) => run(() => invoke('connectors:removeAiJob', { id })),
    /** Промпт - в новый разговор приложения ИИ; false - приложение не открылось. */
    openInAgentApp: (app: AgentApp, prompt: string) =>
      invoke('connectors:openInAgentApp', { app, prompt }),
    /** Slack app с готовым описанием - в браузере; false - браузер не открылся. */
    createSlackApp: () => invoke('connectors:createSlackApp'),
    /** Папка расширения браузера для ИИ в Finder; её нет - false. */
    revealBrowserExtension: () => invoke('connectors:revealBrowserExtension'),
    /** chrome://extensions в Chrome; Chrome не открылся - false. */
    openBrowserExtensions: () => invoke('connectors:openBrowserExtensions'),
    openDiskAccess: () => invoke('connectors:openDiskAccess'),
    /** Разрешение macOS для Computer Use: IDE - в список, открыть настройку; не мак - false. */
    allowComputer: (permission: ComputerPermission) => invoke('computer:allow', { permission }),
  }
}

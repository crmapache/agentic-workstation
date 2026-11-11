import type { TerminalSession } from '@shared/terminal'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { QUERY_KEYS } from '../../state/query-keys'
import { routeOutput } from './terminal-output'
import { DEFAULT_TERMINAL_SIZE } from './terminal.constants'

/** Живые оболочки всех проектов. Владелец - главный процесс, здесь зеркало. */
export const useTerminalSessions = () =>
  useQuery({
    queryKey: QUERY_KEYS.terminalSessions,
    queryFn: () => invoke('terminal:list'),
    staleTime: Infinity,
  })

/** Оболочка вышла или закрылся проект - набор целиком в кэш; вывод - тем, кто рисует. */
export const useTerminalSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('terminal:sessions', (sessions) => {
    queryClient.setQueryData(QUERY_KEYS.terminalSessions, sessions)
  })
  useIpcEvent('terminal:output', routeOutput)
}

/** Новая вкладка и закрытие: ответ - набор сессий, он сразу в кэше. */
export const useTerminalActions = () => {
  const queryClient = useQueryClient()
  const keep = (sessions: TerminalSession[]) =>
    queryClient.setQueryData(QUERY_KEYS.terminalSessions, sessions)

  return {
    /** Новая оболочка в корне проекта: id сессии или null - оболочка не запустилась. */
    open: async (projectId: string): Promise<string | null> => {
      const { sessions, created } = await invoke('terminal:create', {
        projectId,
        ...DEFAULT_TERMINAL_SIZE,
      })

      keep(sessions)

      return created
    },
    close: async (sessionId: string) => keep(await invoke('terminal:close', { sessionId })),
  }
}

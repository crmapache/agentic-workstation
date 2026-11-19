import type { ClaudeConfigView } from '@shared/claude-config'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Что файлы настроек Claude Code проекта значат для панели: что репозиторий перебивает
 * (имена), знает ли CLI флаг слоёв, запрещён ли bypass. Читается при каждом открытии
 * экрана: файлы могли поправить руками.
 */
export const useProjectClaudeSettings = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: QUERY_KEYS.claudeProjectSettings(projectId),
    queryFn: () => invoke('claudeConfig:project', { projectId }),
    enabled,
    staleTime: 0,
  })

/**
 * Собственные настройки Claude Code (`/config`): список от CLI с действующими значениями.
 * Значения перечитываются при каждом открытии, список CLI главный процесс держит сам.
 */
export const useClaudeConfig = (projectId: string) =>
  useQuery({
    queryKey: QUERY_KEYS.claudeConfig(projectId),
    queryFn: () => invoke('claudeConfig:list', { projectId }),
    staleTime: 0,
  })

/** Поменять одну настройку: ответ - список, перечитанный с диска, и исход - в кэш. */
export const useSetClaudeConfig = (projectId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      invoke('claudeConfig:set', { projectId, key, value }),
    onSuccess: (view: ClaudeConfigView) =>
      queryClient.setQueryData(QUERY_KEYS.claudeConfig(projectId), view),
  })
}

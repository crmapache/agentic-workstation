import type { CloudState, TrackerBoard } from '@shared/tracker'
import type { Project } from '@shared/workspace'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/**
 * Доска трекера открытого проекта (ADR 0101). Владелец - главный процесс; первый взгляд
 * заводит доску, если её не было. Ключ - путь проекта, запрос - по id открытой вкладки.
 */
export const useTrackerBoard = (project: Project | null) =>
  useQuery({
    queryKey: QUERY_KEYS.trackerBoard(project?.rootPath ?? ''),
    queryFn: () => invoke('tracker:board', { projectId: project?.id ?? '' }),
    enabled: project !== null,
    staleTime: Infinity,
  })

/** Облако IDE (ADR 0102): значок на шапке трекера и окно аккаунта. */
export const useCloudState = () =>
  useQuery({
    queryKey: QUERY_KEYS.cloudState,
    queryFn: () => invoke('cloud:state'),
    staleTime: Infinity,
  })

/** Подписки трекера и облака, одна на окно: доска и состояние облака - в кэш. */
export const useTrackerSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('tracker:changed', (board) => {
    queryClient.setQueryData<TrackerBoard>(QUERY_KEYS.trackerBoard(board.projectPath), board)
  })
  useIpcEvent('cloud:changed', (state) => {
    queryClient.setQueryData<CloudState>(QUERY_KEYS.cloudState, state)
  })
}

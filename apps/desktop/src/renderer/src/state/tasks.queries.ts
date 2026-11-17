import type { TaskRun, TasksState } from '@shared/tasks'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/** Как часто перечитывать журнал идущего прогона: его транскрипт растёт. */
const LIVE_LOG_MS = 3_000

/**
 * Задания по расписанию (ADR 0069). Владелец - главный процесс: задания и сводки прогонов
 * всех проектов IDE. Здесь зеркало в кэше - его читают вид заданий, число на его иконке и
 * уведомления (прогон по кнопке).
 */
export const useTasks = () =>
  useQuery({
    queryKey: QUERY_KEYS.tasks,
    queryFn: () => invoke('tasks:get'),
    staleTime: Infinity,
  })

/** Прогон целиком, с отчётом; перечитывается, когда его сводка поменялась. */
export const useTaskRun = (runId: string | null) =>
  useQuery({
    queryKey: QUERY_KEYS.taskRun(runId ?? ''),
    queryFn: () => invoke('tasks:run', { runId: runId ?? '' }),
    enabled: runId !== null,
    staleTime: Infinity,
  })

/** Журнал прогона: идущий перечитывается, законченный - один раз. */
export const useTaskLog = (runId: string, live: boolean) =>
  useQuery({
    queryKey: QUERY_KEYS.taskLog(runId),
    queryFn: () => invoke('tasks:log', { runId, earlier: false }),
    staleTime: live ? 0 : Infinity,
    refetchInterval: live ? LIVE_LOG_MS : false,
  })

/** Сколько прогонов ждут человека - число на иконке вида заданий. */
export const waitingCount = (state: TasksState | undefined): number =>
  state?.runs.filter((run) => run.state === 'waiting').length ?? 0

export const useTasksSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('tasks:changed', (state) => {
    queryClient.setQueryData(QUERY_KEYS.tasks, state)

    // Открытый прогон перечитывается, только если его сводка правда поменялась.
    for (const run of state.runs) {
      const key = QUERY_KEYS.taskRun(run.id)
      const cached = queryClient.getQueryData<TaskRun | null>(key)

      if (cached && cached.updatedAt !== run.updatedAt) {
        void queryClient.invalidateQueries({ queryKey: key, exact: true })
      }
    }
  })
}

import type { ProviderId } from '@shared/providers'
import type { TaskRun, TasksState } from '@shared/tasks'
import type { QueryClient } from '@tanstack/react-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/** Как часто перечитывать журнал идущего прогона: его транскрипт растёт. */
const LIVE_LOG_MS = 3_000

/**
 * Задания по расписанию (ADR 0069) и поручения (ADR 0080). Владелец - главный процесс: задания и
 * сводки прогонов всех проектов IDE. Здесь зеркало в кэше - его читают вид заданий, число на его иконке и
 * уведомления (прогон по кнопке).
 */
export const useTasks = () =>
  useQuery({
    queryKey: QUERY_KEYS.tasks,
    queryFn: () => invoke('tasks:get'),
    staleTime: Infinity,
  })

/** Провайдер прогона по зеркалу заданий: его разговор открывается в панели этого провайдера. */
export const runProviderOf = (queryClient: QueryClient, runId: string): ProviderId =>
  queryClient.getQueryData<TasksState>(QUERY_KEYS.tasks)?.runs.find((run) => run.id === runId)
    ?.provider ?? 'claude'

/** Прогон целиком, с отчётом; перечитывается, когда его сводка поменялась. */
export const useTaskRun = (runId: string | null) =>
  useQuery({
    queryKey: QUERY_KEYS.taskRun(runId ?? ''),
    queryFn: () => invoke('tasks:run', { runId: runId ?? '' }),
    enabled: runId !== null,
    staleTime: Infinity,
  })

/** Журнал прогона: идущий перечитывается, законченный - один раз; chapter - глава поручения. */
export const useTaskLog = (runId: string, live: boolean, chapter: number | null = null) =>
  useQuery({
    queryKey: QUERY_KEYS.taskLog(runId, chapter),
    queryFn: () => invoke('tasks:log', { runId, earlier: false, chapter }),
    staleTime: live && chapter === null ? 0 : Infinity,
    refetchInterval: live && chapter === null ? LIVE_LOG_MS : false,
  })

/** Жизнь поручения (ADR 0080); перечитывается с каждым tasks:changed (сторожа, сон). */
export const useTaskGoal = (runId: string, enabled: boolean) =>
  useQuery({
    queryKey: QUERY_KEYS.taskGoal(runId),
    queryFn: () => invoke('tasks:goal', { runId }),
    enabled,
    staleTime: Infinity,
  })

/**
 * Сколько прогонов этого проекта ждут человека - число на иконке вида заданий: вид показывает
 * задания только открытого проекта, как очереди (ADR 0072).
 */
export const waitingCount = (state: TasksState | undefined, rootPath: string | undefined): number =>
  state?.runs.filter((run) => run.state === 'waiting' && run.projectPath === rootPath).length ?? 0

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

    // Жизнь поручения меняется и без перемены прогона: сторож проверил, судья сказал «шум».
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.taskGoals })
  })
}

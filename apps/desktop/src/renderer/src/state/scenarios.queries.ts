import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { ScenarioRun } from '@shared/scenario-runs'
import type { ScenarioShelvesView } from '@shared/scenario-view'
import type { WorkspaceState } from '@shared/workspace'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RunPlace } from '@shared/ipc/scenarios.contract'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/**
 * Сценарии на уровне IDE (ADR 0039). Владелец - главный процесс: очереди всех проектов,
 * полки и история проекта, идущий прогон. Здесь зеркало в кэше, которое читают вид
 * сценариев, значок на его иконке и (позже) всё, кому нужны очереди.
 */

/** Открытые очереди всех проектов и сводки идущих прогонов - одним снимком. */
export const useScenarioQueues = () =>
  useQuery({
    queryKey: QUERY_KEYS.scenarioQueues,
    queryFn: () => invoke('scenarios:queues'),
    staleTime: Infinity,
  })

/** Полки, история прогонов и расписание проекта. */
export const useScenarioShelves = (projectId: string | null) =>
  useQuery({
    queryKey: QUERY_KEYS.scenarioShelves(projectId ?? ''),
    queryFn: () => invoke('scenarios:shelves', { projectId: projectId ?? '' }),
    enabled: projectId !== null,
    staleTime: Infinity,
  })

/** Прогон целиком; свежий присылает главный процесс, пока он идёт. */
export const useScenarioRun = (place: RunPlace | null, runId: string | null) =>
  useQuery({
    queryKey: QUERY_KEYS.scenarioRun(runId ?? ''),
    queryFn: () =>
      invoke('scenarios:run', { place: place ?? { projectId: '' }, runId: runId ?? '' }),
    enabled: place !== null && runId !== null,
    staleTime: Infinity,
  })

/** Провайдеры ИИ для запуска: CLI могли поставить, пока окно открыто - свежие на показ. */
export const useProviders = () =>
  useQuery({ queryKey: QUERY_KEYS.providers, queryFn: () => invoke('providers:list') })

/** Сколько прогонов сейчас ждут человека - число на иконке вида сценариев. */
export const askingCount = (view: ScenarioQueuesView | undefined): number =>
  view?.live.filter((run) => run.asking !== '' || run.state === 'blocked').length ?? 0

const projectIdOf = (workspace: WorkspaceState | undefined, projectPath: string) =>
  workspace?.projects.find((project) => project.rootPath === projectPath)?.id ?? null

export const useScenariosSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('scenarios:queues', (view) => {
    queryClient.setQueryData(QUERY_KEYS.scenarioQueues, view)
  })
  useIpcEvent('scenarios:shelves', ({ projectPath, view }) => {
    const workspace = queryClient.getQueryData<WorkspaceState>(QUERY_KEYS.workspace)
    const projectId = projectIdOf(workspace, projectPath)

    if (projectId) {
      queryClient.setQueryData<ScenarioShelvesView>(QUERY_KEYS.scenarioShelves(projectId), view)
    }
  })
  // Прогон целиком пишется только туда, где его уже смотрят: живые прогоны по кругу шли бы в кэш
  // всех подряд, а прогон, который никто не открыл, окну не нужен.
  useIpcEvent('scenarios:run', ({ run }) => {
    const key = QUERY_KEYS.scenarioRun(run.id)

    if (queryClient.getQueryState(key)) queryClient.setQueryData<ScenarioRun>(key, run)
  })
}

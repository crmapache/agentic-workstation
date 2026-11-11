import { useQuery, skipToken, useInfiniteQuery } from '@tanstack/react-query'

import type {
  StepLogWire,
  ScenarioWire,
} from '@agentic-workstation/remote-protocol/scenario-wire-types'

import { useClient } from '../lib/client'
import { commandData } from './command-data'
import { queryKeys } from './query-keys'

/** Сценарий на полке: проект, полка и id. */
export type ShelfRef = { projectKey: string; scope: 'project' | 'user'; scenarioId: string }

/**
 * Сценарий целиком - командой, когда его открыли. Полки и прогоны он не трогает; после копии и
 * удаления экран перечитывает полки, а не его.
 */
export const useScenario = (agentId: string, ref: ShelfRef | null) => {
  const client = useClient()

  return useQuery({
    queryKey: queryKeys.scenario(
      agentId,
      ref?.projectKey ?? '',
      ref?.scope ?? '',
      ref?.scenarioId ?? '',
    ),
    queryFn: ref
      ? async (): Promise<ScenarioWire> =>
          (await commandData(client, agentId, 'scenarios.fetch', ref)) as ScenarioWire
      : skipToken,
    staleTime: 30_000,
  })
}

/**
 * Журнал шага (или головы) прогона страницами: последняя страница - сразу, выше - по просьбе
 * (before - самый ранний элемент того, что уже есть). Живых заплаток у журнала нет: свежее -
 * «обновить», и тогда снова с конца.
 */
export const useStepLog = (agentId: string, projectKey: string, runId: string, key: string) => {
  const client = useClient()

  return useInfiniteQuery({
    queryKey: queryKeys.stepLog(agentId, projectKey, runId, key),
    queryFn: async ({ pageParam }): Promise<StepLogWire> =>
      (await commandData(client, agentId, 'scenarios.log', {
        projectKey,
        runId,
        key,
        ...(pageParam !== undefined && { before: pageParam }),
      })) as StepLogWire,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: () => undefined,
    getPreviousPageParam: (first) => (first.hasEarlier ? first.items[0]?.id : undefined),
    staleTime: Infinity,
  })
}

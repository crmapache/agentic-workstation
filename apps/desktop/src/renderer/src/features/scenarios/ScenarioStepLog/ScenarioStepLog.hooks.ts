import { useRef, useEffect } from 'react'

import type { ScenarioRun } from '@shared/scenario-runs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RunPlace } from '@shared/ipc/scenarios.contract'

import { invoke } from '../../../lib/ipc'
import { QUERY_KEYS } from '../../../state/query-keys'
import { STEP_LOG_REFRESH_MS } from './ScenarioStepLog.constants'
import { isLogLive } from './ScenarioStepLog.utils'

/**
 * Журнал шага или главного потока - страница его разговора с диска (главный процесс читает
 * транскрипт той же лентой, что панель). Пока разговор идёт, страница перечитывается по часам;
 * кончился - ещё раз напоследок, чтобы последние слова не остались за кадром. «Load earlier»
 * кладёт ответ (лента целиком) в тот же ключ кэша.
 */
export const useStepLog = (place: RunPlace, run: ScenarioRun, logKey: string) => {
  const queryClient = useQueryClient()
  const queryKey = QUERY_KEYS.scenarioStepLog(run.id, logKey)
  const isLive = isLogLive(run, logKey)
  const wasLive = useRef(isLive)
  // Страница выше уже едет: второе нажатие метки не просит её ещё раз.
  const isPaging = useRef(false)
  const query = useQuery({
    queryKey,
    queryFn: () =>
      invoke('scenarios:stepLog', { place, runId: run.id, key: logKey, earlier: false }),
    refetchInterval: isLive ? STEP_LOG_REFRESH_MS : false,
    staleTime: isLive ? 0 : Infinity,
  })

  useEffect(() => {
    if (wasLive.current && !isLive) {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.scenarioStepLog(run.id, logKey) })
    }

    wasLive.current = isLive
  }, [isLive, queryClient, run.id, logKey])

  const loadEarlier = async () => {
    if (isPaging.current) return

    isPaging.current = true

    try {
      const page = await invoke('scenarios:stepLog', {
        place,
        runId: run.id,
        key: logKey,
        earlier: true,
      })

      queryClient.setQueryData(queryKey, page)
    } catch (error) {
      console.warn('[scenarios] ранняя страница журнала не пришла:', error)
    } finally {
      isPaging.current = false
    }
  }

  return { ...query, loadEarlier }
}

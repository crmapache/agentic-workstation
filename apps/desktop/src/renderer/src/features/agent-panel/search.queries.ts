import { useCallback } from 'react'

import type { SearchFindRequest } from '@shared/claude-search'
import { useQuery, keepPreviousData } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { QUERY_KEYS } from '../../state/query-keys'
import { useSearchStore } from './search.store'

/** Сколько ответ на запрос свеж: окно спросит снова, только если открыли позже. */
const ANSWER_FRESH_MS = 2_000

let runCount = 0

/**
 * Ответ на набранный запрос. Пока идёт следующий, на экране прошлый (keepPreviousData):
 * «ничего не нашлось» не мигает на каждом нажатии, о запросе в пути говорит кольцо в поле.
 * Чей это ответ, говорит его scope - чужой вкладки список не рисует.
 */
export const useSearchAnswer = (request: SearchFindRequest, enabled: boolean) =>
  useQuery({
    queryKey: QUERY_KEYS.claudeSearch(request),
    queryFn: () => invoke('claudeSearch:find', request),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: ANSWER_FRESH_MS,
  })

/**
 * Шаги модели по ходу поиска - в стор поиска. Это ход одного прогона, а не данные
 * главного процесса: после ответа он не нужен никому. Подписка одна на окно (MainProcessSync).
 */
export const useClaudeSearchSync = () => {
  useIpcEvent('claudeSearch:step', (step) => useSearchStore.getState().addAiStep(step))
}

/**
 * Вкладка «Ask Claude»: запустить поиск модели по описанию и отменить его. Отмена
 * настоящая - главный процесс гасит прогон, а если его ещё нет, не запускает вовсе.
 */
export const useAskClaude = (projectId: string | null) => {
  const run = useCallback(() => {
    const { ai, startAi, finishAi } = useSearchStore.getState()

    if (!projectId || ai.runId || !ai.query.trim()) return

    runCount += 1

    const runId = `ask-${Date.now()}-${runCount}`

    startAi(runId)
    invoke('claudeSearch:ask', { projectId, runId, query: ai.query })
      .then((outcome) => finishAi(runId, outcome))
      .catch((error: unknown) => {
        console.warn('[agent-panel] поиск модели не ответил:', error)
        finishAi(runId, { status: 'failed', reason: 'failed', detail: '' })
      })
  }, [projectId])

  const cancel = useCallback(() => {
    const { ai, finishAi } = useSearchStore.getState()

    if (!ai.runId) return

    invoke('claudeSearch:cancel', { runId: ai.runId }).catch((error: unknown) =>
      console.warn('[agent-panel] отмена поиска модели не дошла:', error),
    )
    finishAi(ai.runId, { status: 'cancelled' })
  }, [])

  return { run, cancel }
}

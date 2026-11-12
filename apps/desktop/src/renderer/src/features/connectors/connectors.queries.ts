import { useRef } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Серверы из конфига Claude Code, которые можно перенести. Читаются заново на каждое
 * открытие переноса и забываются с ним: конфиг мог поменяться в терминале.
 */
export const useImportCandidates = () =>
  useQuery({
    queryKey: QUERY_KEYS.connectorImportCandidates,
    queryFn: () => invoke('connectors:importCandidates'),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

/**
 * Лента разговора работы ИИ: снимок - запросом (прошлые ходы главный процесс читает с диска),
 * дальше её меняют патчи события (useConnectorsSync). «Load earlier» кладёт ленту целиком в
 * тот же ключ; второе нажатие, пока страница едет, ничего не просит.
 */
export const useAiJobFeed = (jobId: string) => {
  const queryClient = useQueryClient()
  const queryKey = QUERY_KEYS.connectorAiJobFeed(jobId)
  const isPaging = useRef(false)
  const query = useQuery({
    queryKey,
    queryFn: () => invoke('connectors:aiJobFeed', { id: jobId, earlier: false }),
    staleTime: Infinity,
  })

  const loadEarlier = async () => {
    if (isPaging.current) return

    isPaging.current = true

    try {
      queryClient.setQueryData(
        queryKey,
        await invoke('connectors:aiJobFeed', { id: jobId, earlier: true }),
      )
    } catch (error) {
      console.warn('[connectors] ранняя страница разговора не пришла:', error)
    } finally {
      isPaging.current = false
    }
  }

  return { ...query, loadEarlier }
}

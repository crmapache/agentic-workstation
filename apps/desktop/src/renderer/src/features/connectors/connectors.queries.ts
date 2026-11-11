import { useQuery } from '@tanstack/react-query'

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

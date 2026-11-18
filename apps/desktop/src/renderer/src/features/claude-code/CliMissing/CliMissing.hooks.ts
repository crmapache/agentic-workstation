import { useState } from 'react'

import type { ClaudeState } from '@shared/claude'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useClaudeActions } from '../claude-actions.hooks'
import { invoke } from '../../../lib/ipc'
import { QUERY_KEYS } from '../../../state/query-keys'

/**
 * Путь к CLI руками: где панель искала, поле с уже сохранённым путём (пока человек не
 * начал набирать) и «Use this» - главный процесс проверяет, что это Claude Code, и ищет
 * заново. Нашёлся - экран уходит сам: CLI в состоянии становится found.
 */
export const useCliPath = () => {
  const queryClient = useQueryClient()
  const { recheckCli } = useClaudeActions()
  const search = useQuery({
    queryKey: QUERY_KEYS.claudeCliSearch,
    queryFn: () => invoke('claudePanel:cliSearch'),
    staleTime: 0,
  }).data
  const [edited, setEdited] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const path = edited ?? search?.path ?? ''

  const use = () => {
    setIsBusy(true)
    invoke('claudePanel:setCliPath', { path: path.trim() })
      .then(({ state, search: next }) => {
        queryClient.setQueryData(QUERY_KEYS.claudeCliSearch, next)
        queryClient.setQueryData<ClaudeState>(QUERY_KEYS.agentState('claude'), state)
        setEdited(null)
      })
      .catch((error: unknown) => console.warn('[claude-code] путь к CLI не принят:', error))
      .finally(() => setIsBusy(false))
  }

  /** Искать заново (CLI поставили, пока IDE открыта) - и список мест тоже. */
  const recheck = () =>
    void recheckCli().then(() =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.claudeCliSearch }),
    )

  return { search, path, isBusy, setPath: setEdited, use, recheck }
}

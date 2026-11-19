import { useState } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useConversationActions } from '../conversation-actions.hooks'
import { usePutPanelState } from '../panel-state.hooks'
import { invoke } from '../../../lib/ipc'
import { QUERY_KEYS } from '../../../state/query-keys'

/**
 * Путь к CLI руками (сейчас умеет только Claude Code, его каналы): где панель искала, поле с
 * уже сохранённым путём (пока человек не начал набирать) и «Use this» - главный процесс
 * проверяет, что это Claude Code, и ищет заново. Нашёлся - экран уходит сам: CLI в состоянии
 * становится found. Хук живёт только в части с полем: в панели без пути руками кэш поиска
 * Claude не читается вовсе.
 */
export const useCliPath = () => {
  const queryClient = useQueryClient()
  const put = usePutPanelState('claude')
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
    void put(
      invoke('claudePanel:setCliPath', { path: path.trim() }).then(({ state, search: next }) => {
        queryClient.setQueryData(QUERY_KEYS.claudeCliSearch, next)
        setEdited(null)

        return state
      }),
    ).finally(() => setIsBusy(false))
  }

  return { search, path, isBusy, setPath: setEdited, use }
}

/** Искать заново (CLI поставили, пока IDE открыта); с путём руками - и список мест тоже. */
export const useCliRecheck = (hasPath: boolean) => {
  const queryClient = useQueryClient()
  const { recheckCli } = useConversationActions()

  return () =>
    void recheckCli().then(() =>
      hasPath ? queryClient.invalidateQueries({ queryKey: QUERY_KEYS.claudeCliSearch }) : undefined,
    )
}

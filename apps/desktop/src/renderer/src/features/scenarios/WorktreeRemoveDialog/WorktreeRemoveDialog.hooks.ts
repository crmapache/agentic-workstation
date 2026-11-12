import { useQuery } from '@tanstack/react-query'

import { invoke } from '../../../lib/ipc'
import { QUERY_KEYS } from '../../../state/query-keys'

/**
 * Что сейчас в worktree очереди: свои коммиты, несохранённые правки, есть ли папка. Свежие на
 * каждый вопрос (удалить worktree, закрыть очередь) - ответ решает, что человек теряет.
 */
export const useWorktreeFacts = (queueId: string, enabled = true) =>
  useQuery({
    queryKey: QUERY_KEYS.scenarioWorktreeFacts(queueId),
    queryFn: () => invoke('scenarios:worktreeFacts', { queueId }),
    enabled,
    staleTime: 0,
    gcTime: 0,
  })

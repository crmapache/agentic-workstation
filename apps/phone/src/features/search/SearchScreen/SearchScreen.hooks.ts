import { useRef, useState, useEffect } from 'react'

import type {
  SearchWire,
  AiSearchWire,
  SearchHitWire,
} from '@agentic-workstation/remote-protocol/conversation-wire-types'
import type { OpenedConversationWire } from '@agentic-workstation/remote-protocol/wire-types'

import { useClient } from '../../../lib/client'
import { newId } from '../../../lib/ids'
import type { RouteOf } from '../../../lib/route.types'
import { useRouter } from '../../../lib/router.store'
import { CommandError } from '../../../state/command-error'
import { useCommand } from '../../../state/commands.hooks'
import { useInventory } from '../../../state/remote.queries'
import { SEARCH_PROVIDER } from './SearchScreen.constants'
import type { AiRun, SearchResult } from './SearchScreen.types'

/**
 * Поиск по разговорам открытого проекта: словами - индексом IDE (сразу), описанием - моделью (до
 * пары минут, отменяется). Отказ - на экране, а не уведомлением. Найденное открывается как
 * прошлый разговор: вкладка в IDE и разговор здесь. Ушли с экрана посреди поиска модели - он
 * отменяется: его итог показать уже некому, а платится он из лимита.
 */
export const useSearchScreen = (route: RouteOf<'search'>) => {
  const { agentId, projectKey } = route
  const client = useClient()
  const navigate = useRouter((state) => state.navigate)
  const inventory = useInventory(agentId).data
  const search = useCommand(agentId, 'conversation.search', { quiet: true })
  const cancel = useCommand(agentId, 'conversation.searchCancel')
  const open = useCommand(agentId, 'conversation.openHistory')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [aiRun, setAiRun] = useState<AiRun | null>(null)
  const running = useRef<string | null>(null)
  const project = inventory?.projects.find((one) => one.key === projectKey)
  const provider = inventory?.providers.some((one) => one.id === SEARCH_PROVIDER)
    ? SEARCH_PROVIDER
    : (inventory?.providers[0]?.id ?? SEARCH_PROVIDER)
  const text = query.trim()

  useEffect(
    () => () => {
      if (running.current)
        void client.command(agentId, 'conversation.searchCancel', { runId: running.current })
    },
    [client, agentId],
  )

  const handleSearch = async () => {
    if (!text || search.isPending || aiRun) return

    setError(null)

    try {
      setResult({
        kind: 'words',
        data: (await search.mutateAsync({ projectKey, query: text })) as SearchWire,
      })
    } catch (failure) {
      setError(failure)
    }
  }

  const handleAsk = async () => {
    if (!text || aiRun || search.isPending) return

    const runId = newId()

    setError(null)
    setAiRun({ runId, startedAt: Date.now() })
    running.current = runId

    const outcome = await client.command(agentId, 'conversation.searchAi', {
      projectKey,
      runId,
      query: text,
    })

    running.current = null
    setAiRun(null)

    if (outcome.ok) setResult({ kind: 'ai', data: outcome.data as AiSearchWire })
    else setError(new CommandError(outcome))
  }

  const handleCancel = () => {
    if (aiRun) cancel.mutate({ runId: aiRun.runId })
  }

  const handleOpen = async (hit: SearchHitWire) => {
    if (open.isPending) return

    const data = (await open
      .mutateAsync({ projectKey, provider: hit.provider ?? provider, sessionId: hit.sessionId })
      .catch(() => null)) as OpenedConversationWire | null

    if (data?.conversationId) {
      navigate(
        { name: 'conversation', agentId, projectKey, conversationId: data.conversationId },
        { replace: true },
      )
    }
  }

  return {
    inventory,
    project,
    query,
    setQuery,
    canSearch: !!text && !search.isPending && !aiRun,
    isSearching: search.isPending,
    isCancelling: cancel.isPending,
    result,
    error,
    aiRun,
    handleSearch,
    handleAsk,
    handleCancel,
    handleOpen,
  }
}

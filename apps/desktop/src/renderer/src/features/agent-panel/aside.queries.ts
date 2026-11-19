import { useMemo } from 'react'

import type { AsideThread } from '@shared/panel-extras'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { QUERY_KEYS } from '../../state/query-keys'
import { usePanelCapabilities } from './panel.queries'

const NO_THREAD: AsideThread = { open: false, exchanges: [] }

/**
 * Вопросы сбоку (/btw) вкладки. Цепочку держит главный процесс (агент её не видит, в
 * транскрипт она не пишется); здесь зеркало под ключом вкладки, событие пишет туда же.
 * Провайдер без вопроса сбоку не спрашивается: цепочки у его вкладок нет.
 */
export const useAsideThread = (conversationId: string): AsideThread =>
  useQuery({
    queryKey: QUERY_KEYS.claudeAside(conversationId),
    queryFn: () => invoke('claudePanel:getAside', { conversationId }),
    staleTime: Infinity,
    enabled: usePanelCapabilities().sideQuestion,
  }).data ?? NO_THREAD

/** Цепочка вкладки из кэша - для клавиш, где хук не позвать (Esc закрывает карточку). */
export const asideOpen = (
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
): boolean =>
  queryClient.getQueryData<AsideThread>(QUERY_KEYS.claudeAside(conversationId))?.open === true

/** Действия над цепочкой: ответ главного процесса сразу ложится в кэш. */
export const useAsideActions = () => {
  const queryClient = useQueryClient()

  return useMemo(() => {
    const put = (conversationId: string) => (thread: AsideThread) => {
      queryClient.setQueryData(QUERY_KEYS.claudeAside(conversationId), thread)

      return thread
    }
    const warn = (error: unknown) => {
      console.warn('[agent-panel] вопрос сбоку не прошёл:', error)

      return null
    }

    return {
      /** Спросить сбоку; пустой вопрос - открыть цепочку; replaces - заново на месте неудачного. */
      ask: (conversationId: string, question: string, replaces: string | null = null) =>
        invoke('claudePanel:askAside', { conversationId, question, replaces })
          .then(put(conversationId))
          .catch(warn),
      cancel: (conversationId: string, askId: string) =>
        invoke('claudePanel:cancelAside', { conversationId, askId })
          .then(put(conversationId))
          .catch(warn),
      show: (conversationId: string, open: boolean) =>
        invoke('claudePanel:showAside', { conversationId, open })
          .then(put(conversationId))
          .catch(warn),
    }
  }, [queryClient])
}

/** Изменения цепочек от главного процесса (вопрос, повтор API, ответ) - в кэш. */
export const useAsideSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('claudePanel:aside', ({ conversationId, thread }) => {
    queryClient.setQueryData(QUERY_KEYS.claudeAside(conversationId), thread)
  })
}

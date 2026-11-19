import { useMemo, useCallback } from 'react'

import type { UserFeedItem, ConversationFeed } from '@shared/conversation-feed'
import type { MessageDraft } from '@shared/message-draft'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { usePanelProvider } from '../../state/panel-provider.context'
import { QUERY_KEYS } from '../../state/query-keys'
import type { ComposerDraft } from './draft.types'
import { quotesOf } from './draft.utils'
import { hasQuotation } from './message-replay.utils'
import { messageDraft, answersBefore, reusableMessage } from './message.utils'

/**
 * Своё сообщение кусками. Прочитанное из транскрипта разбирается из текста, а кавычки
 * сверяются с ответами выше - их берём из ленты один раз: история под сообщением уже
 * стоит и не меняется.
 */
export const useMessageDraft = (conversationId: string, item: UserFeedItem): MessageDraft => {
  const queryClient = useQueryClient()
  const provider = usePanelProvider()

  return useMemo(() => {
    if (item.draft || !hasQuotation(item.text)) return messageDraft(item)

    const feed = queryClient.getQueryData<ConversationFeed>(
      QUERY_KEYS.agentFeed(provider, conversationId),
    )

    return messageDraft(item, feed ? answersBefore(feed.items, item.id) : [])
  }, [item, conversationId, queryClient, provider])
}

/**
 * Черновик поля из отправленного сообщения - для «вернуть в поле», отката и форка.
 * Картинки сообщения возвращаются байтами из транскрипта (тот же кэш, что у крупного
 * просмотра); не нашлась - файлом, куда её записали, или выпадает.
 */
export const useReuseDraft = () => {
  const queryClient = useQueryClient()
  const provider = usePanelProvider()

  return useCallback(
    async (
      conversationId: string,
      item: UserFeedItem,
      draft: MessageDraft,
    ): Promise<ComposerDraft> => {
      const pictures = await Promise.all(
        item.images.map((_, index) =>
          queryClient
            .fetchQuery({
              queryKey: QUERY_KEYS.agentImage(provider, conversationId, item.id, index),
              queryFn: () =>
                invoke('agent:getImage', { provider, conversationId, messageId: item.id, index }),
              staleTime: Infinity,
            })
            .catch(() => null),
        ),
      )
      const reused = reusableMessage(draft, pictures).draft

      return { tokens: reused.tokens, quotes: quotesOf(reused.quotes) }
    },
    [queryClient, provider],
  )
}

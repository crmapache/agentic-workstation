import type { QueryClient } from '@tanstack/react-query'

import type { RemoteClient } from '../remote/remote-client'
import { useLinkStore } from './link.store'
import { queryKeys } from './query-keys'

/**
 * Зеркало IDE в кэше React Query: каждое слово IDE ложится под свой ключ, экраны только
 * читают. Подписка одна на страницу - здесь, как MainProcessSync у окна IDE. Возвращает отписку.
 */
export const mirrorClient = (client: RemoteClient, queryClient: QueryClient): (() => void) => {
  const link = useLinkStore.getState()
  const offs = [
    client.events.on('message', (agentId, message) => {
      switch (message.k) {
        case 'inventory':
          return queryClient.setQueryData(queryKeys.inventory(agentId), {
            ...message,
            receivedAt: Date.now(),
          })
        case 'conversation':
          return queryClient.setQueryData(
            queryKeys.conversation(agentId, message.conversation.id),
            message.conversation,
          )
        case 'conversationGone':
          // null - «разговора больше нет», в отличие от undefined - «ещё не пришёл».
          return queryClient.setQueryData(
            queryKeys.conversation(agentId, message.conversationId),
            null,
          )
        case 'queues':
          return queryClient.setQueryData(queryKeys.queues(agentId, message.scope), message)
        case 'run':
          return queryClient.setQueryData(queryKeys.run(agentId, message.run.id), message.run)
        case 'notice':
          if (message.code === 'notFound' && message.about) {
            queryClient.setQueryData(queryKeys.run(agentId, message.about), null)
          }
      }
    }),
    client.events.on('feed', (agentId, view) =>
      queryClient.setQueryData(queryKeys.feed(agentId, view.conversationId), view),
    ),
    client.events.on('status', (agentId, status) => link.setStatus(agentId, status)),
    client.events.on('relay', (state) => link.setRelay(state)),
    client.events.on(
      'machines',
      () => void queryClient.invalidateQueries({ queryKey: queryKeys.machines }),
    ),
  ]

  for (const machine of client.machines()) {
    link.setStatus(machine.agentId, client.status(machine.agentId))
  }

  return () => {
    for (const off of offs) off()
  }
}

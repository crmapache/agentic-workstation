import { useEffect } from 'react'

import { useQuery, skipToken } from '@tanstack/react-query'

import type { QueuesMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import type { FeedView } from '@agentic-workstation/remote-protocol/feed'
import type { ShelvesWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'
import type {
  RunWire,
  HistoryWire,
  ConversationWire,
  MessageImageWire,
} from '@agentic-workstation/remote-protocol/wire-types'

import { useClient } from '../lib/client'
import type { LinkStatus } from '../remote/machine-session'
import type { WatchTarget } from '../remote/watch-desk'
import { commandData } from './command-data'
import { CommandError } from './command-error'
import { useLinkStore } from './link.store'
import { queryKeys } from './query-keys'
import type { MachineView, MirroredInventory } from './remote.types'

/**
 * Данные IDE для экранов. Почти всё приходит само (зеркало в state/mirror.ts): запрос здесь
 * только наблюдает ключ (skipToken), а то, что смотреть, экран просит подпиской useWatch.
 * Спрашиваются по требованию список пар (хранилище телефона) и командой - полки сценариев,
 * история проекта и картинка сообщения.
 */

export const useMachines = () => {
  const client = useClient()

  return useQuery({
    queryKey: queryKeys.machines,
    queryFn: (): MachineView[] =>
      client.machines().map(({ agentId, label, fingerprint, pairedAt, revoked }) => ({
        agentId,
        label,
        fingerprint,
        pairedAt,
        revoked,
      })),
  })
}

export const useLinkStatus = (agentId: string): LinkStatus =>
  useLinkStore((state) => state.statuses[agentId] ?? 'connecting')

export const useInventory = (agentId: string) =>
  useQuery<MirroredInventory>({ queryKey: queryKeys.inventory(agentId), queryFn: skipToken })

/** null - разговора больше нет (закрыли в IDE); undefined - ещё не пришёл. */
export const useConversation = (agentId: string, conversationId: string) =>
  useQuery<ConversationWire | null>({
    queryKey: queryKeys.conversation(agentId, conversationId),
    queryFn: skipToken,
  })

export const useFeed = (agentId: string, conversationId: string) =>
  useQuery<FeedView>({ queryKey: queryKeys.feed(agentId, conversationId), queryFn: skipToken })

export const useQueues = (agentId: string, scope: string) =>
  useQuery<QueuesMessage>({ queryKey: queryKeys.queues(agentId, scope), queryFn: skipToken })

/** null - IDE такого прогона не знает. */
export const useRun = (agentId: string, runId: string) =>
  useQuery<RunWire | null>({ queryKey: queryKeys.run(agentId, runId), queryFn: skipToken })

const watchKey = (target: WatchTarget): string => {
  switch (target.kind) {
    case 'conversation':
      return `c:${target.conversationId}`
    case 'run':
      return `r:${target.runId}`
    case 'queues':
      return `q:${target.scope}`
  }
}

/** Смотреть это, пока экран открыт: подписка у IDE и отписка при уходе. */
export const useWatch = (agentId: string, target: WatchTarget) => {
  const client = useClient()
  const key = watchKey(target)

  useEffect(
    () => client.watch(agentId, target),
    // Цель - по ключу: объект цели новый на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, agentId, key],
  )
}

/**
 * Полки проекта - командой, по требованию экрана: сценарии, прогоны с диска и расписание. После
 * команд сценариев (копия, удаление, расписание, звезда) экран перечитывает их сам: зеркалом
 * IDE полки не шлёт.
 */
export const useShelves = (agentId: string, projectKey: string) => {
  const client = useClient()

  return useQuery({
    queryKey: queryKeys.shelves(agentId, projectKey),
    queryFn: async (): Promise<ShelvesWire> =>
      (await commandData(client, agentId, 'scenarios.shelves', { projectKey })) as ShelvesWire,
    staleTime: 30_000,
  })
}

/** Прошлые разговоры проекта у провайдера - командой, по требованию экрана истории. */
export const useHistory = (agentId: string, projectKey: string, provider: string) => {
  const client = useClient()

  return useQuery({
    queryKey: queryKeys.history(agentId, projectKey, provider),
    queryFn: async (): Promise<HistoryWire> => {
      const outcome = await client.command(agentId, 'conversation.history', {
        projectKey,
        provider,
      })

      if (!outcome.ok) throw new CommandError(outcome)

      return outcome.data as HistoryWire
    },
    staleTime: 30_000,
  })
}

/**
 * Картинка сообщения для просмотра - командой, когда её открыли. Картинка сообщения не
 * меняется: однажды полученная лежит в кэше, пока страница жива.
 */
export const useMessageImage = (
  agentId: string,
  conversationId: string,
  photo: { messageId: string; index: number } | null,
) => {
  const client = useClient()

  return useQuery({
    queryKey: queryKeys.image(agentId, conversationId, photo?.messageId ?? '', photo?.index ?? 0),
    queryFn: photo
      ? async (): Promise<MessageImageWire> => {
          const outcome = await client.command(agentId, 'conversation.image', {
            conversationId,
            ...photo,
          })

          if (!outcome.ok) throw new CommandError(outcome)

          return outcome.data as MessageImageWire
        }
      : skipToken,
  })
}

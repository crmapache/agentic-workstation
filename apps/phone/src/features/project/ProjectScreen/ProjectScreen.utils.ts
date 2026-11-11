import type {
  QueueWire,
  ProviderCaps,
  RunSummaryWire,
  ConversationSummary,
} from '@agentic-workstation/remote-protocol/wire-types'

/** Разговоры по провайдерам в порядке, в каком их назвала IDE; незнакомый - своим id. */
export const groupByProvider = (
  conversations: ConversationSummary[],
  providers: ProviderCaps[],
): { provider: string; label: string; items: ConversationSummary[] }[] => {
  const groups = new Map<string, ConversationSummary[]>()

  for (const conversation of conversations) {
    groups.set(conversation.provider, [...(groups.get(conversation.provider) ?? []), conversation])
  }

  const order = providers.map((provider) => provider.id)

  return [...groups]
    .sort(([first], [second]) => rank(order, first) - rank(order, second))
    .map(([provider, items]) => ({
      provider,
      label: providers.find((one) => one.id === provider)?.label ?? provider,
      items,
    }))
}

const rank = (order: string[], id: string) => {
  const at = order.indexOf(id)

  return at === -1 ? order.length : at
}

/** Открытые очереди - сначала те, где что-то идёт; закрытые - история, на телефоне их нет. */
export const openQueues = (queues: QueueWire[], live: RunSummaryWire[]): QueueWire[] => {
  const busy = new Set(live.map((run) => run.queueId))

  return queues
    .filter((queue) => queue.closedAt === 0)
    .sort((first, second) => Number(busy.has(second.id)) - Number(busy.has(first.id)))
}

/** Сколько ждущих в очереди. */
export const waitingCount = (queue: QueueWire): number =>
  queue.items.filter((item) => item.state === 'waiting').length

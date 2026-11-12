import type { ProviderId } from '@shared/providers'

import type { ScenarioProvider } from '../providers/scenario-provider'
import type { QueueBook } from './queues/queue-book'
import { renameQueue } from './queues/queue-rules'

type NamingHost = {
  book: QueueBook
  provider: (id: ProviderId) => ScenarioProvider | null
  onQueues: () => void
}

/**
 * Имя очереди от ИИ: по сценариям очереди и ответам на их вводы, пока человек не назвал сам.
 * Два «Add to queue» подряд дают два вопроса, и ответ на первый может прийти последним -
 * принимается только ответ на самый свежий вопрос по этой очереди.
 */
export class QueueNaming {
  private readonly asked = new Map<string, number>()

  constructor(private readonly host: NamingHost) {}

  async name(queueId: string): Promise<void> {
    const queue = this.host.book.get(queueId)
    const first = queue?.items[0]

    if (!queue || !first || queue.nameSource === 'user') return

    const ticket = (this.asked.get(queueId) ?? 0) + 1

    this.asked.set(queueId, ticket)

    const described = queue.items
      .map((item) => {
        const answers = Object.values(item.inputs).filter((value) => value.trim())

        return `- ${item.scenarioName}${answers.length > 0 ? `: ${answers.join('; ')}` : ''}`
      })
      .join('\n')
    const title = await this.host
      .provider(first.provider)
      ?.suggestTitle(`Scenarios queued:\n${described}`)
      .catch(() => null)
    const now = this.host.book.get(queueId)

    if (this.asked.get(queueId) !== ticket || !title || !now) return

    if (this.host.book.put(renameQueue(now, title, 'ai'))) this.host.onQueues()
  }
}

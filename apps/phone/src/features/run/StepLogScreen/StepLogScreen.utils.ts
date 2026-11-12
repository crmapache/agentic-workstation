import type { FeedView } from '@agentic-workstation/remote-protocol/feed'
import type { StepLogWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'

/**
 * Журнал шага страницами - видом ленты разговора, чтобы рисовать его той же лентой: страницы по
 * порядку (верхняя - первой), элемент, попавший на две страницы, - один раз. Живых заплаток у
 * журнала нет: epoch и номер пустые.
 */
export const logView = (stepKey: string, pages: readonly StepLogWire[]): FeedView => {
  const seen = new Set<string>()
  const items = pages
    .flatMap((page) => page.items)
    .filter((item) => {
      if (seen.has(item.id)) return false

      seen.add(item.id)

      return true
    })

  return {
    conversationId: stepKey,
    epoch: '',
    seq: 0,
    items,
    tasks: [],
    hasEarlier: pages[0]?.hasEarlier ?? false,
  }
}

import type { FeedView } from '@agentic-workstation/remote-protocol/feed'
import type { StepLogWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'
import type { FeedStepsWire } from '@agentic-workstation/remote-protocol/wire-types'

/**
 * Журнал шага страницами - видом ленты разговора, чтобы рисовать его той же лентой: страницы по
 * порядку (верхняя - первой), элемент, попавший на две страницы, - один раз; счёт шагов
 * субагентов - со всех страниц (у каждой - свои вызовы). Живых заплаток у журнала нет: epoch и
 * номер пустые. Ни одна страница счёта не несёт - IDE постарше, шаги лежат в items.
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
  const counted = pages.flatMap((page) => (page.steps ? [page.steps] : []))

  return {
    conversationId: stepKey,
    epoch: '',
    seq: 0,
    items,
    tasks: [],
    ...(counted.length > 0 && {
      steps: counted.reduce<FeedStepsWire>((all, one) => ({ ...all, ...one }), {}),
    }),
    hasEarlier: pages[0]?.hasEarlier ?? false,
  }
}

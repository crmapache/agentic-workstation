import type { TurnFeedItem } from '@shared/conversation-feed'

import type { TurnEnd } from './TurnSummary.types'

/** Чем кончился ход - для подписи под ним. */
export const turnEnd = (item: Pick<TurnFeedItem, 'interrupted' | 'forAccount'>): TurnEnd => {
  if (!item.interrupted) return 'worked'

  return item.forAccount ? 'movedAccount' : 'stopped'
}

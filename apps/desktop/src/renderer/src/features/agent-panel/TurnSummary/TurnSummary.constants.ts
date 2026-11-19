import type { ParseKeys } from 'i18next'

import type { TurnEnd } from './TurnSummary.types'

/** Подпись итога: со временем работы и без него (время неизвестно). */
export const RESULT_KEYS: Record<TurnEnd, { timed: ParseKeys; bare: ParseKeys }> = {
  worked: { timed: 'agentPanel.feed.result.worked', bare: 'agentPanel.feed.result.workedBare' },
  stopped: { timed: 'agentPanel.feed.result.stopped', bare: 'agentPanel.feed.result.stoppedBare' },
  movedAccount: {
    timed: 'agentPanel.feed.result.movedAccount',
    bare: 'agentPanel.feed.result.movedAccountBare',
  },
}

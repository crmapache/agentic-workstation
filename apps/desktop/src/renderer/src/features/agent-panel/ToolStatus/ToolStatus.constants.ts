import type { ParseKeys } from 'i18next'

import type { ClosedReason } from '@shared/conversation-feed'

/** Итог закрытого без результата вызова в шапке - по причине (как closedMeta в ACC). */
export const CLOSED_META_KEYS: Record<ClosedReason, ParseKeys> = {
  replay: 'agentPanel.feed.tool.closedMeta.replay',
  exited: 'agentPanel.feed.tool.closedMeta.exited',
  stopped: 'agentPanel.feed.tool.closedMeta.stopped',
  turnEnded: 'agentPanel.feed.tool.closedMeta.turnEnded',
  untracked: 'agentPanel.feed.tool.closedMeta.untracked',
  restarted: 'agentPanel.feed.tool.closedMeta.restarted',
}

/** Почему вызов закрыт без результата - строкой в раскрытой карточке. */
export const CLOSED_KEYS: Record<ClosedReason, ParseKeys> = {
  replay: 'agentPanel.feed.tool.closed.replay',
  exited: 'agentPanel.feed.tool.closed.exited',
  stopped: 'agentPanel.feed.tool.closed.stopped',
  turnEnded: 'agentPanel.feed.tool.closed.turnEnded',
  untracked: 'agentPanel.feed.tool.closed.untracked',
  restarted: 'agentPanel.feed.tool.closed.restarted',
}

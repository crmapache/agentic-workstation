import type { TrackerCard, TrackerBoard } from '@shared/tracker'

import type { TrackerSending } from '../tracker.types'
import { findNode, queueCardsOf } from '../tracker.utils'

/**
 * Что уйдёт в очередь и подпись над списком: карточки группы по порядку (без сценария - пометками;
 * в выбранную очередь queueId - без пометок, что уже стояли в ней) или одна карточка.
 */
export const sendingOf = (
  board: TrackerBoard,
  sending: TrackerSending,
  queueId: string | null,
): { cards: TrackerCard[]; title: string } => {
  const node = findNode(board.projects, sending.kind === 'card' ? sending.cardId : sending.groupId)

  if (sending.kind === 'card') {
    const card = node?.kind === 'task' || node?.kind === 'followUp' ? node.card : null

    return { cards: card ? [card] : [], title: card?.title ?? '' }
  }

  const group = node?.kind === 'group' ? node.group : null

  return { cards: group ? queueCardsOf(group, queueId) : [], title: group?.title ?? '' }
}

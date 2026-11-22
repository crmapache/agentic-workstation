import type { TrackerCard, TrackerBoard } from '@shared/tracker'

import type { TrackerEditor } from '../tracker.types'
import { findNode } from '../tracker.utils'

/** Карточка доски по id - задача или продолжение. */
export const findCard = (board: TrackerBoard, cardId: string): TrackerCard | null => {
  const node = findNode(board.projects, cardId)

  return node?.kind === 'task' || node?.kind === 'followUp' ? node.card : null
}

/** Заголовок и подзаголовок того, что правит окно проекта, потока или группы. */
export const entityTexts = (
  board: TrackerBoard,
  editor: Extract<TrackerEditor, { kind: 'project' | 'flow' | 'group' }>,
): { title: string; subtitle: string } => {
  const node = editor.id === null ? null : findNode(board.projects, editor.id)

  switch (node?.kind) {
    case 'project':
      return { title: node.project.title, subtitle: node.project.description }
    case 'flow':
      return { title: node.flow.title, subtitle: node.flow.subtitle }
    case 'group':
      return { title: node.group.title, subtitle: node.group.subtitle }
    default:
      return { title: '', subtitle: '' }
  }
}

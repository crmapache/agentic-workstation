import type { TrackerCard, TrackerBoard } from '@shared/tracker'

import type { TrackerEditor, TrackerSending } from '../tracker.types'
import { sendableCards } from '../tracker.utils'

const allGroups = (board: TrackerBoard) =>
  board.projects.flatMap((project) => project.flows.flatMap((flow) => flow.groups))

/** Карточка доски по id - задача или продолжение. */
export const findCard = (board: TrackerBoard, cardId: string): TrackerCard | null => {
  for (const group of allGroups(board)) {
    for (const task of group.tasks) {
      if (task.id === cardId) return task

      const card = task.followUps.find((one) => one.id === cardId)

      if (card) return card
    }
  }

  return null
}

/** Заголовок и подзаголовок того, что правит окно проекта, потока или группы. */
export const entityTexts = (
  board: TrackerBoard,
  editor: Extract<TrackerEditor, { kind: 'project' | 'flow' | 'group' }>,
): { title: string; subtitle: string } => {
  if (editor.id === null) return { title: '', subtitle: '' }

  for (const project of board.projects) {
    if (project.id === editor.id) return { title: project.title, subtitle: project.description }

    for (const flow of project.flows) {
      if (flow.id === editor.id) return { title: flow.title, subtitle: flow.subtitle }

      const group = flow.groups.find((one) => one.id === editor.id)

      if (group) return { title: group.title, subtitle: group.subtitle }
    }
  }

  return { title: '', subtitle: '' }
}

/** Что уйдёт в очередь и подпись над списком: карточки группы по порядку или одна карточка. */
export const sendingOf = (
  board: TrackerBoard,
  sending: TrackerSending,
): { cards: TrackerCard[]; title: string } => {
  if (sending.kind === 'card') {
    const card = findCard(board, sending.cardId)

    return { cards: card ? [card] : [], title: card?.title ?? '' }
  }

  const group = allGroups(board).find((one) => one.id === sending.groupId)

  return { cards: group ? sendableCards(group) : [], title: group?.title ?? '' }
}

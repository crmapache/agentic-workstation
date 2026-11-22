import type {
  TrackerDue,
  TrackerCard,
  TrackerFlow,
  TrackerTask,
  TrackerBoard,
  TrackerGroup,
  TrackerProject,
  TrackerArchived,
  TrackerScenario,
} from '@shared/tracker'

import { repeatView, autoRunView } from './tracker-repeat-args'
import { timeOf } from './workstation-args'

/**
 * Доска трекера для модели (ADR 0101): пустое не пишется - доска большая, а модель читает её
 * целиком. Ключи - как аргументы инструментов (scenario_id, queue_id): что прочла, то и пишет.
 */

/** Срок так же, как его принимают инструменты: «2026-11-21» или «2026-11-21 09:30». */
export const dueText = (due: TrackerDue): string =>
  due.time ? `${due.date} ${due.time}` : due.date

const scenarioView = (scenario: TrackerScenario) => ({
  scenario_id: scenario.scenarioId,
  scope: scenario.scope,
  ...(scenario.provider && { provider: scenario.provider }),
  ...(Object.keys(scenario.inputs).length > 0 && { inputs: scenario.inputs }),
})

export const cardView = (card: TrackerCard) => ({
  id: card.id,
  title: card.title,
  ...(card.subtitle && { subtitle: card.subtitle }),
  ...(card.description && { description: card.description }),
  ...(card.due && { due: dueText(card.due) }),
  ...(card.repeat && { repeat: repeatView(card.repeat) }),
  priority: card.priority,
  ...(card.done && { done: true }),
  ...(card.scenario && { scenario: scenarioView(card.scenario) }),
  ...autoRunView(card),
  ...(card.run && {
    run: { state: card.run.state, queue_id: card.run.queueId, item_id: card.run.itemId },
  }),
  ...(card.lock && { locked: card.lock }),
})

const taskView = (task: TrackerTask) => ({
  ...cardView(task),
  ...(task.followUps.length > 0 && { follow_ups: task.followUps.map(cardView) }),
})

const groupView = (group: TrackerGroup) => ({
  id: group.id,
  title: group.title,
  ...(group.subtitle && { subtitle: group.subtitle }),
  tasks: group.tasks.map(taskView),
})

const flowView = (flow: TrackerFlow) => ({
  id: flow.id,
  title: flow.title,
  ...(flow.subtitle && { subtitle: flow.subtitle }),
  groups: flow.groups.map(groupView),
})

export const projectView = (project: TrackerProject) => ({
  id: project.id,
  title: project.title,
  ...(project.description && { description: project.description }),
  flows: project.flows.map(flowView),
})

export const archivedView = (project: TrackerArchived) => ({
  id: project.id,
  title: project.title,
  ...(project.description && { description: project.description }),
  archived_at: timeOf(project.archivedAt),
  purge_at: timeOf(project.purgeAt),
})

/** Доска целиком или один проект трекера (onlyId). */
export const boardView = (board: TrackerBoard, onlyId?: string) => {
  const archived = board.archived.filter((one) => !onlyId || one.id === onlyId)

  return {
    project_path: board.projectPath,
    tracker_projects: board.projects.filter((one) => !onlyId || one.id === onlyId).map(projectView),
    ...(archived.length > 0 && { archived: archived.map(archivedView) }),
  }
}

/** Где на доске лежит запись: её вид, родитель и задача, в цепочке которой она продолжение. */
export type Spot = { view: unknown; parentId: string | null; chainOf: string | null }

type Row = { flow: TrackerFlow; projectId: string }

const flowsOf = (board: TrackerBoard): Row[] =>
  board.projects.flatMap((project) =>
    project.flows.map((flow) => ({ flow, projectId: project.id })),
  )

const groupsOf = (board: TrackerBoard) =>
  flowsOf(board).flatMap(({ flow }) => flow.groups.map((group) => ({ group, flowId: flow.id })))

const tasksOf = (board: TrackerBoard) =>
  groupsOf(board).flatMap(({ group }) => group.tasks.map((task) => ({ task, groupId: group.id })))

/** Все карточки открытой части доски: задачи и их продолжения. */
export const cardsOf = (board: TrackerBoard): TrackerCard[] =>
  tasksOf(board).flatMap(({ task }) => [task, ...task.followUps])

/** Задача, в цепочке которой стоит карточка (сама задача или её продолжение). */
const chainTask = (board: TrackerBoard, cardId: string) =>
  tasksOf(board).find(
    ({ task }) => task.id === cardId || task.followUps.some((one) => one.id === cardId),
  )

/** Запись на открытой части доски (архив не смотрится); null - её там нет. */
export const locate = (board: TrackerBoard, id: string): Spot | null => {
  const project = board.projects.find((one) => one.id === id)
  const flow = flowsOf(board).find((one) => one.flow.id === id)
  const group = groupsOf(board).find((one) => one.group.id === id)
  const chain = chainTask(board, id)

  if (project) return { view: projectView(project), parentId: null, chainOf: null }
  if (flow) return { view: flowView(flow.flow), parentId: flow.projectId, chainOf: null }
  if (group) return { view: groupView(group.group), parentId: group.flowId, chainOf: null }
  if (!chain) return null
  if (chain.task.id === id)
    return { view: taskView(chain.task), parentId: chain.groupId, chainOf: null }

  const followUp = chain.task.followUps.find((one) => one.id === id)

  return followUp
    ? { view: cardView(followUp), parentId: chain.groupId, chainOf: chain.task.id }
    : null
}

/** Куда встаёт запись: вкладки, потоки проекта, группы потока, задачи группы, цепочка задачи. */
export type Slot =
  | { kind: 'project' }
  | { kind: 'flow' | 'group' | 'task'; parentId: string }
  | { kind: 'followUp'; cardId: string }

const ids = (list: readonly { id: string }[]) => list.map((one) => one.id)

/** id по порядку в месте на открытой доске; null - такого места там нет. */
export const slotOrder = (board: TrackerBoard, slot: Slot): string[] | null => {
  switch (slot.kind) {
    case 'project':
      return ids(board.projects)
    case 'flow': {
      const project = board.projects.find((one) => one.id === slot.parentId)

      return project ? ids(project.flows) : null
    }
    case 'group': {
      const row = flowsOf(board).find((one) => one.flow.id === slot.parentId)

      return row ? ids(row.flow.groups) : null
    }
    case 'task': {
      const row = groupsOf(board).find((one) => one.group.id === slot.parentId)

      return row ? ids(row.group.tasks) : null
    }
    case 'followUp': {
      const row = chainTask(board, slot.cardId)

      return row ? ids(row.task.followUps) : null
    }
  }
}

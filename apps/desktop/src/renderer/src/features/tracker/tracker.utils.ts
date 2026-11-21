import { parseDay } from '@shared/task-clock'
import type {
  TrackerDue,
  TrackerCard,
  TrackerGroup,
  TrackerCardRun,
  TrackerProject,
  TrackerPriority,
} from '@shared/tracker'
import { isInQueue } from '@shared/tracker'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

import type { NearDayWords } from '../../lib/dates.utils'
import { daysBetween, nearDayLabel } from '../../lib/dates.utils'
import type { TrackerNode } from './tracker.types'

/** Местная полночь дня срока; null - не дата (главный процесс такой срок не пропускает). */
export const dueDayOf = (due: TrackerDue): number | null => parseDay(due.date)?.getTime() ?? null

/** Минуты от полуночи времени срока `HH:MM`. */
export const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number)

  return (hours ?? 0) * 60 + (minutes ?? 0)
}

/**
 * Тон срока: прошёл - красный, сегодня - оранжевый, дальше - спокойный. Сделанное и срок, который
 * не читается датой, - спокойно: торопить нечем.
 */
export const dueTone = (due: TrackerDue, today: number, done: boolean): BadgeTone => {
  const day = dueDayOf(due)

  if (done || day === null) return 'neutral'

  const days = daysBetween(today, day)

  return days < 0 ? 'danger' : days === 0 ? 'accent' : 'neutral'
}

/** Тон приоритета как в Todoist: P1 - красный, P2 - жёлтый, P3 - мятный, P4 - не показывается. */
export const priorityTone = (priority: TrackerPriority): BadgeTone | null =>
  priority === 1 ? 'danger' : priority === 2 ? 'warning' : priority === 3 ? 'info' : null

/** Тон метки прогона карточки; gone - метки нет. */
export const runTone = (run: TrackerCardRun): BadgeTone | null =>
  run.state === 'running'
    ? 'accent'
    : run.state === 'done'
      ? 'success'
      : run.state === 'failed'
        ? 'danger'
        : run.state === 'stopped' || run.state === 'refused'
          ? 'warning'
          : run.state === 'waiting'
            ? 'neutral'
            : null

/** Что уйдёт в очередь из группы - тем же правилом, что у главного процесса. */
export const sendableCards = (group: TrackerGroup): TrackerCard[] =>
  group.tasks
    .flatMap((task) => [task, ...task.followUps])
    .filter((card) => card.scenario !== null && !card.done && !isInQueue(card.run))

/** Соседи для перетаскивания: кто следующий в группе, в цепочке, в потоке, на доске. */
export type BoardNeighbours = {
  nextTask: Map<string, string | null>
  nextFollowUp: Map<string, string | null>
  nextGroup: Map<string, string | null>
  nextFlow: Map<string, string | null>
  /** Задача карточки: сама задача или задача её цепочки. */
  rootOf: Map<string, string>
  /** Продолжения задачи: их нельзя сделать местом её же переноса. */
  followUpsOf: Map<string, string[]>
  /** Группа задачи и поток группы: «то же место» - только в своём же списке. */
  groupOf: Map<string, string>
  flowOf: Map<string, string>
}

const nextOf = (ids: readonly string[]) =>
  new Map(ids.map((id, index) => [id, ids[index + 1] ?? null]))

export const neighboursOf = (project: TrackerProject): BoardNeighbours => {
  const neighbours: BoardNeighbours = {
    nextTask: new Map(),
    nextFollowUp: new Map(),
    nextGroup: new Map(),
    nextFlow: nextOf(project.flows.map((flow) => flow.id)),
    rootOf: new Map(),
    followUpsOf: new Map(),
    groupOf: new Map(),
    flowOf: new Map(),
  }

  for (const flow of project.flows) {
    for (const [id, next] of nextOf(flow.groups.map((group) => group.id)))
      neighbours.nextGroup.set(id, next)

    for (const group of flow.groups) {
      neighbours.flowOf.set(group.id, flow.id)

      for (const [id, next] of nextOf(group.tasks.map((task) => task.id)))
        neighbours.nextTask.set(id, next)

      for (const task of group.tasks) {
        const chain = task.followUps.map((card) => card.id)

        neighbours.rootOf.set(task.id, task.id)
        neighbours.groupOf.set(task.id, group.id)
        neighbours.followUpsOf.set(task.id, chain)

        for (const [id, next] of nextOf(chain)) {
          neighbours.nextFollowUp.set(id, next)
          neighbours.rootOf.set(id, task.id)
        }
      }
    }
  }

  return neighbours
}

/**
 * Срок словами: «Today 09:30», «Tomorrow», «Fri», дальше - «Tue, Dec 1». Срок, который не
 * читается датой, - как записан.
 */
export const dueLabel = (due: TrackerDue, today: number, words: NearDayWords): string => {
  const day = dueDayOf(due)
  const date = day === null ? due.date : nearDayLabel(day, today, words)

  return due.time ? `${date} ${due.time}` : date
}

/**
 * Один обход доски проект → поток → группа → задача → продолжение для поиска по id: окна,
 * отправка и призрак перетаскивания берут узел отсюда, а не обходят доску каждый по-своему.
 */
export const findNode = (projects: readonly TrackerProject[], id: string): TrackerNode | null => {
  for (const project of projects) {
    if (project.id === id) return { kind: 'project', project }

    for (const flow of project.flows) {
      if (flow.id === id) return { kind: 'flow', flow, project }

      for (const group of flow.groups) {
        if (group.id === id) return { kind: 'group', group, flow, project }

        for (const task of group.tasks) {
          if (task.id === id) return { kind: 'task', card: task, group, flow, project }

          const card = task.followUps.find((one) => one.id === id)

          if (card) return { kind: 'followUp', card, task, group, flow, project }
        }
      }
    }
  }

  return null
}

import { DAY_MS } from '@shared/time-units'
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

import { WEEKDAY, WEEKDAY_DAY } from './tracker.constants'

/** Местная полночь дня срока. */
export const dueDayOf = (due: TrackerDue): number => {
  const [year, month, day] = due.date.split('-').map(Number)

  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getTime()
}

/** Строка срока из местной полуночи: `YYYY-MM-DD`. */
export const dateOfDay = (day: number): string => {
  const date = new Date(day)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Время срока в минутах от полуночи и обратно. */
export const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number)

  return (hours ?? 0) * 60 + (minutes ?? 0)
}

export const timeOf = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** Сколько дней до срока от сегодняшней полуночи: 0 - сегодня, -1 - вчера. */
export const daysUntil = (due: TrackerDue, today: number): number =>
  Math.round((dueDayOf(due) - today) / DAY_MS)

/** Тон срока: прошёл - красный, сегодня - оранжевый, дальше - спокойный. Сделанное - спокойно. */
export const dueTone = (due: TrackerDue, today: number, done: boolean): BadgeTone => {
  if (done) return 'neutral'

  const days = daysUntil(due, today)

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

/** Слова ближних дней из i18n. */
export type DueWords = { today: string; tomorrow: string; yesterday: string }

/** Срок словами: «Today 09:30», «Tomorrow», «Fri», дальше - «Tue, Dec 1». */
export const dueLabel = (due: TrackerDue, today: number, words: DueWords): string => {
  const days = daysUntil(due, today)
  const day = dueDayOf(due)
  const date =
    days === 0
      ? words.today
      : days === 1
        ? words.tomorrow
        : days === -1
          ? words.yesterday
          : Math.abs(days) < 7
            ? WEEKDAY.format(day)
            : WEEKDAY_DAY.format(day)

  return due.time ? `${date} ${due.time}` : date
}

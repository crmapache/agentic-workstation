import type {
  TrackerDue,
  TrackerCard,
  TrackerTask,
  TrackerBoard,
  TrackerRepeat,
  TrackerPriority,
  TrackerRunState,
  TrackerScenario,
} from '@shared/tracker'
import { TRACKER_PRIORITIES, TRACKER_ARCHIVE_DAYS } from '@shared/tracker'
import { dueKey } from '@shared/tracker-repeat'

import type { RunLink, AutoRunLink } from './tracker-book'
import { dueOf, repeatOf, scenarioOf } from './tracker-fields'
import type { TrackerRecord } from './tracker-records'
import { flagOf, textOf, valueOf, numberOf } from './tracker-records'
import type { TrackerTree } from './tracker-tree'

/** Состояние элемента очереди по связи карточки; gone - элемента больше нет. */
export type RunStateOf = (link: RunLink) => TrackerRunState

/** Что о карточках знает только этот компьютер: прогоны, их состояние и запуск в срок. */
export type CardLocal = {
  runs: Record<string, RunLink>
  autoRuns: Record<string, AutoRunLink>
  runState: RunStateOf
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Значение из записи, которое не прошло бы проверку правки, читается как пустое. */
const safely = <T>(read: () => T, fallback: T): T => {
  try {
    return read()
  } catch {
    return fallback
  }
}

export const dueValue = (record: TrackerRecord): TrackerDue | null =>
  safely(() => dueOf(valueOf(record, 'due') ?? null), null)

/** Повтор без срока не повторяет ничего - читается как пустой. */
export const repeatValue = (record: TrackerRecord): TrackerRepeat | null =>
  dueValue(record) ? safely(() => repeatOf(valueOf(record, 'repeat') ?? null), null) : null

const scenarioValue = (record: TrackerRecord): TrackerScenario | null =>
  safely(() => scenarioOf(valueOf(record, 'scenario') ?? null), null)

const priorityValue = (record: TrackerRecord): TrackerPriority => {
  const value = valueOf(record, 'priority')

  return TRACKER_PRIORITIES.find((priority) => priority === value) ?? 4
}

/** Карточка для окна и модели из записи. */
export const cardOf = (record: TrackerRecord, local: CardLocal): TrackerCard => {
  const link = local.runs[record.id]
  const autoRun = local.autoRuns[record.id]
  const due = dueValue(record)

  return {
    id: record.id,
    title: textOf(record, 'title'),
    subtitle: textOf(record, 'subtitle'),
    description: textOf(record, 'description'),
    due,
    repeat: repeatValue(record),
    priority: priorityValue(record),
    done: flagOf(record, 'done'),
    doneAt: numberOf(record, 'doneAt'),
    scenario: scenarioValue(record),
    autoRun: autoRun !== undefined,
    autoRunFailure: autoRun?.failure ?? null,
    autoRunSent: autoRun !== undefined && due !== null && autoRun.firedFor === dueKey(due),
    run: link
      ? {
          queueId: link.queueId,
          itemId: link.itemId,
          sentAt: link.sentAt,
          state: local.runState(link),
        }
      : null,
  }
}

/** Доска проекта IDE: проекты трекера по месту, архив - по времени ухода, новые сверху. */
export const boardOf = (
  tree: TrackerTree,
  spaceId: string,
  projectPath: string,
  local: CardLocal,
): TrackerBoard => {
  const card = (record: TrackerRecord) => cardOf(record, local)
  const task = (record: TrackerRecord): TrackerTask => ({
    ...card(record),
    followUps: tree.followUps(record.id).map((one) => card(one.record)),
  })
  const projects = tree.children(spaceId, 'project')

  return {
    projectPath,
    projects: projects
      .filter((one) => numberOf(one.record, 'archivedAt') === null)
      .map(({ id, record }) => ({
        id,
        title: textOf(record, 'title'),
        description: textOf(record, 'description'),
        flows: tree.children(id, 'flow').map((flow) => ({
          id: flow.id,
          title: textOf(flow.record, 'title'),
          subtitle: textOf(flow.record, 'subtitle'),
          groups: tree.children(flow.id, 'group').map((group) => ({
            id: group.id,
            title: textOf(group.record, 'title'),
            subtitle: textOf(group.record, 'subtitle'),
            tasks: tree.tasks(group.id).map((one) => task(one.record)),
          })),
        })),
      })),
    archived: projects
      .flatMap(({ id, record }) => {
        const archivedAt = numberOf(record, 'archivedAt')

        return archivedAt === null
          ? []
          : [
              {
                id,
                title: textOf(record, 'title'),
                description: textOf(record, 'description'),
                archivedAt,
                purgeAt: archivedAt + TRACKER_ARCHIVE_DAYS * DAY_MS,
              },
            ]
      })
      .sort((a, b) => b.archivedAt - a.archivedAt),
  }
}

/** Проекты в архиве, срок которых вышел: их удаляет сам трекер. */
export const expiredArchives = (tree: TrackerTree, now: number): string[] =>
  tree
    .all('project')
    .filter((record) => {
      const archivedAt = numberOf(record, 'archivedAt')

      return (
        !flagOf(record, 'deleted') &&
        archivedAt !== null &&
        now - archivedAt >= TRACKER_ARCHIVE_DAYS * DAY_MS
      )
    })
    .map((record) => record.id)

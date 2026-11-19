import { dueVerdict } from '@shared/task-clock'
import { isNextSkipped, isRepeatingSchedule } from '@shared/tasks'
import type { Task, TaskCode } from '@shared/tasks'

/**
 * Сроки, которые пришли к удару часов: что с каждым делать (dueVerdict) и не пропустил ли его
 * человек. Срок, который ещё не пора, в список не попадает.
 */
export const cameDue = (tasks: readonly Task[], now: number) =>
  tasks.flatMap((task) => {
    const verdict = dueVerdict(task, now)

    return verdict === 'wait'
      ? []
      : [{ id: task.id, verdict, due: task.nextAt, skipped: isNextSkipped(task) }]
  })

/**
 * Задание с пропуском ближайшего срока (skip) или без него. Пропустить можно только срок ритма,
 * за которым есть следующий: у разового это было бы выключение, у «вручную» сроков нет.
 */
export const withSkip = (task: Task, skip: boolean, now: number): Task | TaskCode =>
  task.kind !== 'schedule' || !isRepeatingSchedule(task.schedule) || task.nextAt === 0
    ? 'badSchedule'
    : { ...task, skipAt: skip ? task.nextAt : 0, updatedAt: now }

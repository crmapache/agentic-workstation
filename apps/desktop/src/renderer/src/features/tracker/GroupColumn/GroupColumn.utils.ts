import type { TrackerTask } from '@shared/tracker'

import type { LaneSlot } from './GroupColumn.types'

/**
 * Столбики продолжений группы: в первом - первые продолжения задач по порядку группы, во втором
 * - вторые и так далее. Поле нового продолжения задачи встаёт в столбик за последней карточкой
 * её цепочки. Столбик на столбик не ровняется: каждый идёт своим ходом, без пустот под короткими.
 */
export const followUpLanes = (
  tasks: readonly TrackerTask[],
  addingFor: string | null,
): LaneSlot[][] => {
  const lanes: LaneSlot[][] = []
  // Номер столбика растёт от нуля по шагу на задачу, поэтому дыр между столбиками не бывает.
  const put = (index: number, slot: LaneSlot) => (lanes[index] ??= []).push(slot)

  for (const task of tasks) {
    task.followUps.forEach((card, index) =>
      put(index, {
        kind: 'card',
        card,
        taskId: task.id,
        last: index === task.followUps.length - 1,
      }),
    )

    if (task.id === addingFor) put(task.followUps.length, { kind: 'add', taskId: task.id })
  }

  return lanes
}

import type { TrackerFlow } from '@shared/tracker'

import type { RowStart } from './FlowSection.types'

/**
 * Куда встать ряду при открытии: к первой колонке, где есть невыполненная карточка (задача или
 * продолжение), - слева сделанное, дальше работа. Сделано всё - в конец ряда, к последней
 * колонке и месту новой; колонок нет - в начало.
 */
export const rowStartOf = (flow: TrackerFlow): RowStart => {
  const open = flow.groups.find((group) =>
    group.tasks.some((task) => !task.done || task.followUps.some((card) => !card.done)),
  )

  return open ? { kind: 'group', id: open.id } : flow.groups.length > 0 ? { kind: 'end' } : null
}

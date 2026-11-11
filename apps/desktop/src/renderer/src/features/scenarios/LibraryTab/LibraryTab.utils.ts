import type { ScenarioQueue } from '@shared/scenario-queues'
import type { Scenario } from '@shared/scenarios'

import type { RowBox } from '../scenarios-shelves.utils'
import type { RowLoad, DragFrame } from './LibraryTab.types'

/**
 * Что сценарий делает в очередях этого проекта: сколько его элементов идёт и сколько ждёт.
 * Только открытые очереди проекта: полка - вид проекта, а личный сценарий, идущий в другом
 * проекте, здесь ни при чём. Сценарий узнаётся по id и полке - двойники на двух полках разные.
 */
export const loadOf = (
  queues: readonly ScenarioQueue[],
  projectPath: string,
  scenario: Pick<Scenario, 'id' | 'scope'>,
): RowLoad => {
  const items = queues
    .filter((queue) => queue.projectPath === projectPath && queue.closedAt === 0)
    .flatMap((queue) => queue.items)
    .filter((item) => item.scenarioId === scenario.id && item.scope === scenario.scope)

  return {
    running: items.filter((item) => item.state === 'running').length,
    queued: items.filter((item) => item.state === 'waiting').length,
  }
}

/**
 * Раскладка полок от их верха: верх полок едет с прокруткой, и числа от него ей не мешают.
 * Граница полок - верх второй полки: полку решает середина несомой строки.
 */
export const measureFrame = (root: HTMLElement, key: string): DragFrame => {
  const base = root.getBoundingClientRect().top
  const rows: RowBox[] = []
  let origin = 0

  for (const node of root.querySelectorAll<HTMLElement>('[data-shelf-row]')) {
    const rect = node.getBoundingClientRect()
    const nodeKey = node.dataset.shelfRow ?? ''

    if (nodeKey === key) origin = rect.top - base
    else
      rows.push({
        key: nodeKey,
        shelf: node.dataset.shelf === 'project' ? 'project' : 'user',
        top: rect.top - base,
        height: rect.height,
      })
  }

  const second = root.querySelector<HTMLElement>('[data-shelf-heading="user"]')
  const shelves = root.querySelectorAll('[data-shelf-heading]').length
  const box = second?.getBoundingClientRect()

  return { rows, origin, boundary: box && shelves > 1 ? box.top - base : null }
}

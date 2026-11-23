import { ACTIVITY_BAR_IDS } from '@shared/window'

import { BAR_GROUPS } from './bar-buttons.constants'
import type { BarGroup, BarArrangement, BarArrangements } from './bar-buttons.types'
import { asRecord } from './layout.utils'

/**
 * Порядок группы: сохранённый человеком, а кнопки, которых в нём нет (новый вид IDE, новое
 * расширение), - на своём месте по умолчанию: сразу за соседом, который стоит перед ними и там.
 * Id из сохранённого, которых сейчас нет, остаются - по ним кнопка вернётся на своё место.
 */
export const mergedOrder = (
  defaults: readonly string[],
  saved: readonly string[] = [],
): string[] => {
  const order = [...saved]

  defaults.forEach((id, index) => {
    if (order.includes(id)) return

    const before = defaults.slice(0, index).findLast((one) => order.includes(one))

    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, id)
  })

  return order
}

/** Кнопки группы, которые сейчас есть, по её порядку - вместе со спрятанными: для меню с галочками. */
export const arrangedIds = (
  defaults: readonly string[],
  arrangement: BarArrangement,
  group: BarGroup,
): string[] => {
  const available = new Set(defaults)

  return mergedOrder(defaults, arrangement.order[group]).filter((id) => available.has(id))
}

/** Кнопки группы в самой полосе: по её порядку, без спрятанных. */
export const shownIds = (
  defaults: readonly string[],
  arrangement: BarArrangement,
  group: BarGroup,
): string[] =>
  arrangedIds(defaults, arrangement, group).filter((id) => !arrangement.hidden.includes(id))

/**
 * Кнопки полосы для меню с галочками: по группам сверху вниз и их порядку, спрятанные - без
 * галочки. Пустых групп нет: между группами в меню черта, а лишняя черта - мусор.
 */
export const menuGroups = <Button extends { id: string }>(
  groups: Record<BarGroup, readonly Button[]>,
  arrangement: BarArrangement,
): { button: Button; shown: boolean }[][] =>
  BAR_GROUPS.map((group) => {
    const buttons = new Map(groups[group].map((button) => [button.id, button]))
    const ids = arrangedIds([...buttons.keys()], arrangement, group)

    return ids.flatMap((id) => {
      const button = buttons.get(id)

      return button ? [{ button, shown: !arrangement.hidden.includes(id) }] : []
    })
  }).filter((list) => list.length > 0)

/**
 * Порядок группы после перетаскивания: кнопка встаёт перед beforeId, а null - сразу за последней
 * видной кнопкой, а не в самый конец: спрятанные, что стояли за ней, так за ней и останутся.
 */
export const movedOrder = (
  order: readonly string[],
  shown: readonly string[],
  id: string,
  beforeId: string | null,
): string[] => {
  const rest = order.filter((one) => one !== id)
  const last = shown.filter((one) => one !== id).at(-1)
  const anchor = beforeId === null ? last : beforeId
  const index = anchor === undefined ? -1 : rest.indexOf(anchor)
  const at = index < 0 ? rest.length : beforeId === null ? index + 1 : index

  rest.splice(at, 0, id)

  return rest
}

/** Спрятанные после галочки: shown - стоять кнопке в полосе или нет. */
export const withShown = (hidden: readonly string[], id: string, shown: boolean): string[] => {
  const rest = hidden.filter((one) => one !== id)

  return shown ? rest : [...rest, id]
}

const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((one) => typeof one === 'string')

const restoreArrangement = (value: unknown): BarArrangement => {
  const { order, hidden } = asRecord(value)
  const groups = asRecord(order)

  return {
    order: Object.fromEntries(
      BAR_GROUPS.flatMap((group) => {
        const ids = groups[group]

        return isIdList(ids) ? [[group, ids]] : []
      }),
    ),
    hidden: isIdList(hidden) ? hidden : [],
  }
}

/** Раскладки полос из localStorage: что не той формы - как не было, полоса как задумано. */
export const restoreArrangements = (persisted: unknown): BarArrangements => {
  const bars = asRecord(asRecord(persisted).bars)

  return Object.fromEntries(
    ACTIVITY_BAR_IDS.flatMap((bar) =>
      bars[bar] === undefined ? [] : [[bar, restoreArrangement(bars[bar])]],
    ),
  )
}

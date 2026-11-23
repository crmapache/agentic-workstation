import type { TabSlot } from './tab-drag.types'

/** Зазор между вкладками ряда - по снимку, а не из стилей: одна вкладка - зазора нет. */
const gapOf = (slots: readonly TabSlot[]): number => {
  const [first, second] = slots

  return first && second ? second.start - (first.start + first.size) : 0
}

/**
 * Сдвиг несомой вкладки под рукой, но в пределах ряда: за первую и последнюю она не уходит.
 * Здесь и ниже всё - вдоль оси ряда (TabSlot): «вперёд» - вправо или вниз, «назад» - влево или вверх.
 */
export const clampOffset = (slots: readonly TabSlot[], from: number, delta: number): number => {
  const carried = slots[from]
  const first = slots[0]
  const last = slots.at(-1)

  if (!carried || !first || !last) return 0

  const min = first.start - carried.start
  const max = last.start + last.size - (carried.start + carried.size)

  return Math.min(Math.max(delta, min), max)
}

/**
 * Место, куда встанет несомая вкладка при сдвиге offset: сосед впереди пройден, когда её передний
 * край миновал его середину, сосед позади - когда задний. По середине самой вкладки до
 * последнего места было бы не дойти: у края ряда её середина лишь встаёт на середину крайней.
 */
const placeAt = (slots: readonly TabSlot[], from: number, offset: number): number => {
  const carried = slots[from]

  if (!carried) return from

  const start = carried.start + offset
  const end = start + carried.size
  const middle = (slot: TabSlot) => slot.start + slot.size / 2
  const passedAhead = slots.filter((slot, index) => index > from && end > middle(slot)).length
  const passedBehind = slots.filter((slot, index) => index < from && start < middle(slot)).length

  return from + passedAhead - passedBehind
}

/**
 * Новое место несомой вкладки по её сдвигу. Место меняется, только если и с запасом gap назад
 * к прежнему вышло бы то же: на самой границе рука дрожит, и соседи дрожали бы с ней.
 */
export const nextPlace = (
  slots: readonly TabSlot[],
  from: number,
  current: number,
  offset: number,
  gap: number,
): number => {
  const wanted = placeAt(slots, from, offset)
  const backOff = wanted > current ? -gap : gap

  return wanted !== current && placeAt(slots, from, offset + backOff) === wanted ? wanted : current
}

/**
 * Сдвиги соседей, уступивших место: вкладки между старым и новым местом едут на размер
 * несомой и зазор - назад, если её несут вперёд, и вперёд, если назад.
 */
export const shiftsFor = (
  slots: readonly TabSlot[],
  from: number,
  place: number,
): Record<string, number> => {
  const carried = slots[from]

  if (!carried || place === from) return {}

  const stride = carried.size + gapOf(slots)
  const moved = place > from ? slots.slice(from + 1, place + 1) : slots.slice(place, from)
  const shift = place > from ? -stride : stride

  return Object.fromEntries(moved.map((slot) => [slot.id, shift]))
}

/**
 * Сдвиг брошенной вкладки до её нового места: передним краем к переднему краю той, чьё место
 * она заняла, если её несли вперёд, и задним к заднему - если назад.
 */
export const landingOffset = (slots: readonly TabSlot[], from: number, place: number): number => {
  const carried = slots[from]
  const target = slots[place]

  if (!carried || !target || place === from) return 0

  return place > from
    ? target.start + target.size - (carried.start + carried.size)
    : target.start - carried.start
}

/** Перед какой вкладкой встать, чтобы оказаться на месте place; null - в конец ряда. */
export const beforeOf = (ids: readonly string[], from: number, place: number): string | null =>
  ids.filter((_, index) => index !== from)[place] ?? null

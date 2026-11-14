import type { TabSlot } from './ProjectTabs.types'

/** Зазор между вкладками ряда - по снимку, а не из стилей: одна вкладка - зазора нет. */
const gapOf = (slots: readonly TabSlot[]): number => {
  const [first, second] = slots

  return first && second ? second.left - (first.left + first.width) : 0
}

/** Сдвиг несомой вкладки под рукой, но в пределах ряда: за первую и последнюю она не уходит. */
export const clampOffset = (slots: readonly TabSlot[], from: number, dx: number): number => {
  const carried = slots[from]
  const first = slots[0]
  const last = slots.at(-1)

  if (!carried || !first || !last) return 0

  const min = first.left - carried.left
  const max = last.left + last.width - (carried.left + carried.width)

  return Math.min(Math.max(dx, min), max)
}

/**
 * Место, куда встанет несомая вкладка при сдвиге offset: сосед справа пройден, когда её правый
 * край миновал его середину, сосед слева - когда левый край. По середине самой вкладки до
 * последнего места было бы не дойти: у края ряда её середина лишь встаёт на середину крайней.
 */
const placeAt = (slots: readonly TabSlot[], from: number, offset: number): number => {
  const carried = slots[from]

  if (!carried) return from

  const left = carried.left + offset
  const right = left + carried.width
  const middle = (slot: TabSlot) => slot.left + slot.width / 2
  const passedRight = slots.filter((slot, index) => index > from && right > middle(slot)).length
  const passedLeft = slots.filter((slot, index) => index < from && left < middle(slot)).length

  return from + passedRight - passedLeft
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
 * Сдвиги соседей, уступивших место: вкладки между старым и новым местом едут на ширину
 * несомой и зазор - влево, если её несут вправо, и вправо, если влево.
 */
export const shiftsFor = (
  slots: readonly TabSlot[],
  from: number,
  place: number,
): Record<string, number> => {
  const carried = slots[from]

  if (!carried || place === from) return {}

  const stride = carried.width + gapOf(slots)
  const moved = place > from ? slots.slice(from + 1, place + 1) : slots.slice(place, from)
  const shift = place > from ? -stride : stride

  return Object.fromEntries(moved.map((slot) => [slot.id, shift]))
}

/**
 * Сдвиг брошенной вкладки до её нового места: правым краем к правому краю той, чьё место она
 * заняла, если её несли вправо, и левым к левому - если влево.
 */
export const landingOffset = (slots: readonly TabSlot[], from: number, place: number): number => {
  const carried = slots[from]
  const target = slots[place]

  if (!carried || !target || place === from) return 0

  return place > from
    ? target.left + target.width - (carried.left + carried.width)
    : target.left - carried.left
}

/** Перед какой вкладкой встать, чтобы оказаться на месте place; null - в конец ряда. */
export const beforeOf = (ids: readonly string[], from: number, place: number): string | null =>
  ids.filter((_, index) => index !== from)[place] ?? null

/**
 * Шаг прокрутки ряда за кадр, пока рука у его края: чем ближе к краю, тем быстрее, минус -
 * влево. Ряд, которому листать некуда, не едет.
 */
export const autoScrollStep = (
  pointerX: number,
  box: { left: number; right: number },
  room: { before: number; after: number },
  edge: number,
  maxStep: number,
): number => {
  const toLeft = pointerX - box.left
  const toRight = box.right - pointerX

  if (toLeft < edge && room.before > 0) {
    return -Math.min(room.before, Math.ceil(((edge - Math.max(toLeft, 0)) / edge) * maxStep))
  }

  if (toRight < edge && room.after > 0) {
    return Math.min(room.after, Math.ceil(((edge - Math.max(toRight, 0)) / edge) * maxStep))
  }

  return 0
}

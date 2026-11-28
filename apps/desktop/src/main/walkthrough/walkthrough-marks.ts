import type { MarkBox, MarkPoint, WalkthroughPen } from '@shared/walkthrough'

/**
 * Геометрия показа (ADR 0135): подсветка модели - область по двум углам (в пикселях её снимка,
 * потом в точках экрана), пометки человека - путь руки или начало и конец линии в точках экрана.
 */

/** Прямоугольник по двум углам в любом порядке. */
export const boxOf = ([a, b]: readonly [MarkPoint, MarkPoint]): MarkBox => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
})

/** Рамка точек; точек нет - пустая рамка в нуле. */
export const boundsOf = (points: readonly MarkPoint[]): MarkBox => {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)

  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

const centerOf = ({ x, y, width, height }: MarkBox): MarkPoint => ({
  x: x + width / 2,
  y: y + height / 2,
})

/** Точки, по которым видно, что подсветка ещё на своём месте: окна в них не поменялись. */
export const boxAnchors = (box: MarkBox): MarkPoint[] => [
  centerOf(box),
  { x: box.x, y: box.y },
  { x: box.x + box.width, y: box.y + box.height },
]

/**
 * То же для пометки человека: у обводки - середина её рамки, у подчёркивания - середина линии, у
 * стрелки - острие (последняя точка).
 */
export const strokeAnchors = (pen: WalkthroughPen, points: readonly MarkPoint[]): MarkPoint[] => {
  const tip = points.at(-1)

  if (pen === 'arrow') return tip ? [tip] : []

  return [centerOf(boundsOf(points))]
}

/** Поля крупного плана вокруг пометки: видно, что рядом, но не весь экран. */
const CLOSE_UP_PAD = 24

/** Над подчёркиванием - строка текста, которую подчеркнули: столько точек вверх. */
const UNDERLINED_LINE = 44

/** Крупный план вокруг острия стрелки: половина ширины и высоты. */
const TIP_HALF = { width: 110, height: 70 }

/**
 * Где на экране смотреть пометку крупно (в точках экрана): у обводки - её рамка с полями, у
 * подчёркивания - строка над линией, у стрелки - то, на что показывает острие.
 */
export const closeUpOf = (pen: WalkthroughPen, points: readonly MarkPoint[]): MarkBox => {
  const tip = points.at(-1) ?? { x: 0, y: 0 }

  if (pen === 'arrow') {
    return {
      x: tip.x - TIP_HALF.width,
      y: tip.y - TIP_HALF.height,
      width: TIP_HALF.width * 2,
      height: TIP_HALF.height * 2,
    }
  }

  const box = boundsOf(points)
  const above = pen === 'underline' ? UNDERLINED_LINE : 0

  return {
    x: box.x - CLOSE_UP_PAD,
    y: box.y - CLOSE_UP_PAD - above,
    width: box.width + CLOSE_UP_PAD * 2,
    height: box.height + CLOSE_UP_PAD * 2 + above,
  }
}

const at = (point: MarkPoint): string => `(${Math.round(point.x)}, ${Math.round(point.y)})`

/** Пометка человека словами для модели; точки - пиксели её снимка. */
export const strokeText = (pen: WalkthroughPen, pixels: readonly MarkPoint[]): string => {
  const first = pixels[0] ?? { x: 0, y: 0 }
  const last = pixels.at(-1) ?? first

  if (pen === 'arrow') return `drew an arrow from ${at(first)} pointing at ${at(last)}`

  if (pen === 'underline') return `underlined from ${at(first)} to ${at(last)}`

  const box = boundsOf(pixels)

  return `circled the area ${at(box)}-${at({ x: box.x + box.width, y: box.y + box.height })}`
}

/**
 * Пометка, которую стоит хранить: не случайный щелчок. У обводки и подчёркивания - заметный
 * размах, у стрелки - заметная длина.
 */
export const isDrawn = (points: readonly MarkPoint[]): boolean => {
  const { width, height } = boundsOf(points)

  return points.length >= 2 && Math.max(width, height) >= 8
}

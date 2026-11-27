import type { MarkBox, MarkPoint, WalkthroughMark } from '@shared/walkthrough'

import type { Rect } from '../computer/computer-geometry'

/**
 * Что модель просит нарисовать (ADR 0134): обвести область, затемнить всё, кроме неё, или показать
 * стрелкой на точку (from - откуда; нет - стрелка выберет сама). Сначала - в пикселях снимка
 * модели, после movedBy - в точках экрана.
 */
export type MarkRequest =
  | { kind: 'circle' | 'spotlight'; corners: [MarkPoint, MarkPoint] }
  | { kind: 'arrow'; to: MarkPoint; from: MarkPoint | null }

/** Точки запроса: углы области или острие и начало стрелки. */
export const pointsOf = (request: MarkRequest): MarkPoint[] =>
  request.kind === 'arrow'
    ? [request.to, ...(request.from ? [request.from] : [])]
    : [...request.corners]

/** Тот же запрос в других точках: пиксели снимка модели - в точки экрана. */
export const movedBy = (
  request: MarkRequest,
  move: (point: MarkPoint) => MarkPoint,
): MarkRequest =>
  request.kind === 'arrow'
    ? { kind: 'arrow', to: move(request.to), from: request.from ? move(request.from) : null }
    : { kind: request.kind, corners: [move(request.corners[0]), move(request.corners[1])] }

/** Длина стрелки, у которой модель не назвала начало: заметно, но не через весь экран. */
export const ARROW_LENGTH = 150

/** Стрелка не начинается вплотную к краю дисплея: хвост и тень должны поместиться. */
const EDGE = 24

/** Прямоугольник по двум углам в любом порядке. */
export const boxOf = ([a, b]: [MarkPoint, MarkPoint]): MarkBox => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
})

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value))

/**
 * Откуда идёт стрелка без названного начала: от точки к середине дисплея - там места больше всего,
 * - сдвинутое вверх-влево, чтобы стрелка шла наискосок, как рисует рука, а не вдоль строки. Конец
 * в самой середине - стрелка приходит слева сверху.
 */
export const arrowTail = (to: MarkPoint, display: Rect): MarkPoint => {
  const center = { x: display.x + display.width / 2, y: display.y + display.height / 2 }
  const dx = center.x - to.x
  const dy = center.y - to.y - display.height * 0.15
  const length = Math.hypot(dx, dy)
  const unit =
    length > 1 ? { x: dx / length, y: dy / length } : { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }

  return {
    x: clamp(to.x + unit.x * ARROW_LENGTH, display.x + EDGE, display.x + display.width - EDGE),
    y: clamp(to.y + unit.y * ARROW_LENGTH, display.y + EDGE, display.y + display.height - EDGE),
  }
}

/**
 * Метка в точках окна меток: окно стоит на дисплее (origin - его левый верхний угол), метки
 * приходят в точках экрана.
 */
export const markIn = (
  request: MarkRequest,
  id: number,
  display: Rect,
  origin: MarkPoint,
): WalkthroughMark => {
  const local = (point: MarkPoint): MarkPoint => ({ x: point.x - origin.x, y: point.y - origin.y })

  if (request.kind === 'arrow') {
    const from = request.from ?? arrowTail(request.to, display)

    return { kind: 'arrow', id, from: local(from), to: local(request.to) }
  }

  const box = boxOf(request.corners)

  return { kind: request.kind, id, box: { ...box, ...local(box) } }
}

/**
 * Точки, по которым видно, что метка ещё на своём месте: окна в них не поменялись. У области -
 * середина и углы, у стрелки - острие.
 */
export const anchorsOf = (request: MarkRequest): MarkPoint[] => {
  if (request.kind === 'arrow') return [request.to]

  const { x, y, width, height } = boxOf(request.corners)

  return [
    { x: x + width / 2, y: y + height / 2 },
    { x, y },
    { x: x + width, y: y + height },
  ]
}

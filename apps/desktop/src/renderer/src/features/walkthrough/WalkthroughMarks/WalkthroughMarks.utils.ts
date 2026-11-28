import type { MarkBox, MarkPoint } from '@shared/walkthrough'

import {
  ARROW_BEND,
  CUTOUT_PAD,
  POINT_STEP,
  ARROW_SAMPLES,
  CUTOUT_RADIUS,
} from './WalkthroughMarks.constants'
import type { ArrowShape } from './WalkthroughMarks.types'

/** Число с тремя знаками после точки: путь SVG короче, а глаз разницы не видит. */
const fixed = (value: number): string => String(Math.round(value * 1000) / 1000)

/**
 * Сглаженный путь через точки: кривые идут через середины соседних отрезков (как маркер в
 * Shotter), без углов на изломах.
 */
export const smoothPath = (points: readonly MarkPoint[]): string => {
  const [first, ...rest] = points
  const last = rest.at(-1)

  if (!first || !last) return ''

  const parts = [`M${fixed(first.x)} ${fixed(first.y)}`]

  rest.slice(0, -1).forEach((point, index) => {
    const next = rest[index + 1] ?? last

    parts.push(
      `Q${fixed(point.x)} ${fixed(point.y)} ${fixed((point.x + next.x) / 2)} ${fixed((point.y + next.y) / 2)}`,
    )
  })
  parts.push(`L${fixed(last.x)} ${fixed(last.y)}`)

  return parts.join(' ')
}

/** Опорная точка кривой: кривая проходит ровно через точку изгиба поперёк середины. */
const curveControl = (start: MarkPoint, end: MarkPoint, across: number): MarkPoint => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy) || 1
  const middle = {
    x: (start.x + end.x) / 2 + (dy / length) * length * across,
    y: (start.y + end.y) / 2 - (dx / length) * length * across,
  }

  return { x: 2 * middle.x - (start.x + end.x) / 2, y: 2 * middle.y - (start.y + end.y) / 2 }
}

/**
 * Стрелка как в Shotter (arrow-shape.ts): квадратичная кривая через точку изгиба, древко -
 * залитый многоугольник, тонкий у хвоста и в полную толщину у наконечника, наконечник - «дротик»
 * с выемкой, по касательной к кривой, на хвосте - круглый торец.
 */
export const arrowShape = (
  start: MarkPoint,
  end: MarkPoint,
  stroke: number,
  across = ARROW_BEND,
): ArrowShape => {
  const control = curveControl(start, end, across)
  const curve = Array.from({ length: ARROW_SAMPLES + 1 }, (_, index) => {
    const t = index / ARROW_SAMPLES
    const u = 1 - t

    return {
      x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
    }
  })
  // Длина кривой от хвоста до каждой точки.
  let walked = 0
  const lengths = curve.map((point, index) => {
    const previous = curve[index - 1] ?? point

    walked += Math.hypot(point.x - previous.x, point.y - previous.y)

    return walked
  })
  const total = lengths.at(-1) ?? 0
  // Наконечник растёт медленнее линии: у тонкой стрелки он не огромный, у толстой не мелкий.
  const headLength = Math.min(5 + stroke * 3.1, total * 0.6)
  const headWidth = headLength * 0.9
  const notch = headLength * 0.7
  // Древко кончается внутри наконечника, у его выемки.
  const shaft = curve.filter((_, index) => (lengths[index] ?? 0) <= Math.max(0, total - notch))
  const tail = Math.max(1.2, stroke * 0.38)
  const body = Math.min(stroke, headWidth * 0.5)
  const left: MarkPoint[] = []
  const right: MarkPoint[] = []

  shaft.forEach((point, index) => {
    const previous = shaft[Math.max(0, index - 1)] ?? point
    const next = shaft[Math.min(shaft.length - 1, index + 1)] ?? point
    const dx = next.x - previous.x
    const dy = next.y - previous.y
    const size = Math.hypot(dx, dy) || 1
    const progress = shaft.length > 1 ? index / (shaft.length - 1) : 1
    const half = (tail + (body - tail) * progress ** 0.7) / 2

    left.push({ x: point.x - (dy / size) * half, y: point.y + (dx / size) * half })
    right.push({ x: point.x + (dy / size) * half, y: point.y - (dx / size) * half })
  })

  const ax = end.x - control.x
  const ay = end.y - control.y
  const axis = Math.hypot(ax, ay) || 1
  const direction = { x: ax / axis, y: ay / axis }
  const side = { x: -direction.y, y: direction.x }
  const back = { x: end.x - direction.x * headLength, y: end.y - direction.y * headLength }

  return {
    shaft: [...left, ...[...right].reverse()],
    head: [
      end,
      { x: back.x + (side.x * headWidth) / 2, y: back.y + (side.y * headWidth) / 2 },
      { x: end.x - direction.x * notch, y: end.y - direction.y * notch },
      { x: back.x - (side.x * headWidth) / 2, y: back.y - (side.y * headWidth) / 2 },
    ],
    tail: { center: start, radius: tail / 2 },
  }
}

/** Замкнутый многоугольник по часовой: перекрытия древка и наконечника не прорезают дыр. */
const polygonPath = (points: readonly MarkPoint[]): string => {
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length] ?? point

    return sum + point.x * next.y - next.x * point.y
  }, 0)
  const ordered = area < 0 ? [...points].reverse() : points

  return `${ordered.map((point, index) => `${index ? 'L' : 'M'}${fixed(point.x)} ${fixed(point.y)}`).join(' ')} Z`
}

/** Древко, наконечник и круглый хвост одним путём: заливается один раз. */
export const arrowPath = (shape: ArrowShape): string => {
  const { center, radius } = shape.tail
  const circle =
    `M${fixed(center.x - radius)} ${fixed(center.y)} ` +
    `a${fixed(radius)} ${fixed(radius)} 0 1 0 ${fixed(radius * 2)} 0 ` +
    `a${fixed(radius)} ${fixed(radius)} 0 1 0 ${fixed(-radius * 2)} 0 Z`

  return [polygonPath(shape.shaft), polygonPath(shape.head), circle].join(' ')
}

/** Наконечник отдельно: его обводят тонкой линией со скруглением, чтобы смягчить острые углы. */
export const headPath = (shape: ArrowShape): string => polygonPath(shape.head)

/**
 * Затемнение всего окна с вырезами вокруг подсвеченных областей: внешний прямоугольник и
 * скруглённые вырезы, заливка по правилу evenodd. У одной подсветки путь всегда одной формы -
 * переход CSS по `d` ведёт вырез к новому месту плавно.
 */
export const spotlightPath = (width: number, height: number, boxes: readonly MarkBox[]): string => {
  const holes = boxes.map((box) => {
    const { x, y, width: w, height: h, radius: r } = cutoutOf(box)

    return [
      `M${fixed(x + r)} ${fixed(y)}`,
      `H${fixed(x + w - r)}`,
      `A${fixed(r)} ${fixed(r)} 0 0 1 ${fixed(x + w)} ${fixed(y + r)}`,
      `V${fixed(y + h - r)}`,
      `A${fixed(r)} ${fixed(r)} 0 0 1 ${fixed(x + w - r)} ${fixed(y + h)}`,
      `H${fixed(x + r)}`,
      `A${fixed(r)} ${fixed(r)} 0 0 1 ${fixed(x)} ${fixed(y + h - r)}`,
      `V${fixed(y + r)}`,
      `A${fixed(r)} ${fixed(r)} 0 0 1 ${fixed(x + r)} ${fixed(y)}`,
      'Z',
    ].join(' ')
  })

  return [`M0 0 H${fixed(width)} V${fixed(height)} H0 Z`, ...holes].join(' ')
}

/** Вырез вокруг области: с зазором, скругление не больше половины стороны. */
export const cutoutOf = (box: MarkBox): MarkBox & { radius: number } => {
  const width = box.width + CUTOUT_PAD * 2
  const height = box.height + CUTOUT_PAD * 2

  return {
    x: box.x - CUTOUT_PAD,
    y: box.y - CUTOUT_PAD,
    width,
    height,
    radius: Math.min(CUTOUT_RADIUS, width / 2, height / 2),
  }
}

/**
 * Следующая точка пути руки: ближе POINT_STEP к прошлой - не нужна. У подчёркивания и стрелки
 * (straight) путь - только начало и конец.
 */
export const nextPoints = (
  points: readonly MarkPoint[],
  point: MarkPoint,
  straight: boolean,
): MarkPoint[] => {
  const [first] = points

  if (!first) return [point]

  if (straight) return [first, point]

  const last = points.at(-1) ?? first

  return Math.hypot(point.x - last.x, point.y - last.y) < POINT_STEP
    ? [...points]
    : [...points, point]
}

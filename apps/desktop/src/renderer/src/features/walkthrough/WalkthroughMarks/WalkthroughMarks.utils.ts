import type { MarkBox, MarkPoint } from '@shared/walkthrough'

import {
  ARROW_BEND,
  ARROW_SAMPLES,
  CIRCLE_SPREAD,
  CIRCLE_WOBBLE,
  SPOTLIGHT_PAD,
  CIRCLE_PAD_MAX,
  CIRCLE_PAD_MIN,
  CIRCLE_SAMPLES,
  CIRCLE_OVERSHOOT,
  SPOTLIGHT_RADIUS,
  CIRCLE_MIN_RADIUS,
  CIRCLE_WIDE_ASPECT,
  CIRCLE_SQUARENESS_MAX,
} from './WalkthroughMarks.constants'
import type { ArrowShape } from './WalkthroughMarks.types'

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value))

/** Число с тремя знаками после точки: путь SVG короче, а глаз разницы не видит. */
const fixed = (value: number): string => String(Math.round(value * 1000) / 1000)

/**
 * Повторимая «случайность» от номера метки: одна и та же метка при перерисовке не меняет формы,
 * а соседние метки нарисованы по-разному, как рукой.
 */
export const noise = (seed: number, salt: number): number => {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453

  return value - Math.floor(value)
}

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

/** Знак числа на степень его модуля: суперэллипс в параметрах. */
const signedPower = (value: number, power: number): number =>
  Math.sign(value) * Math.abs(value) ** power

/**
 * Петля маркером вокруг области, как обводит рука на созвоне: суперэллипс с запасом (углы
 * прямоугольника внутри), чуть повёрнутый, с дрожью радиуса, начатый сверху слева и заведённый за
 * начало чуть шире - конец не попадает точно в начало. Форма зависит от номера метки (seed).
 */
export const circlePoints = (box: MarkBox, seed: number): MarkPoint[] => {
  const pad = clamp(Math.min(box.width, box.height) * 0.2, CIRCLE_PAD_MIN, CIRCLE_PAD_MAX)
  const aspect = Math.max(box.width, box.height) / Math.max(1, Math.min(box.width, box.height))
  const squareness =
    2 + (CIRCLE_SQUARENESS_MAX - 2) * clamp((aspect - 1) / (CIRCLE_WIDE_ASPECT - 1), 0, 1)
  // Суперэллипс степени n проходит через угол прямоугольника при радиусе 2^(1/n) от половины.
  const reach = 2 ** (1 / squareness)
  const rx = Math.max((box.width / 2) * reach + pad, CIRCLE_MIN_RADIUS)
  const ry = Math.max((box.height / 2) * reach + pad, CIRCLE_MIN_RADIUS)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const tilt = (noise(seed, 1) - 0.5) * 0.06
  const start = -2.3 + (noise(seed, 2) - 0.5) * 0.5
  const sweep = Math.PI * 2 + CIRCLE_OVERSHOOT
  const phase = noise(seed, 3) * Math.PI * 2
  const power = 2 / squareness

  return Array.from({ length: CIRCLE_SAMPLES + 1 }, (_, index) => {
    const share = index / CIRCLE_SAMPLES
    const angle = start + sweep * share
    const wobble = 1 + CIRCLE_WOBBLE * Math.sin(angle * 3 + phase)
    const spread = 1 - CIRCLE_SPREAD / 2 + CIRCLE_SPREAD * share
    const x = rx * signedPower(Math.cos(angle), power) * wobble * spread
    const y = ry * signedPower(Math.sin(angle), power) * wobble * spread

    return {
      x: cx + x * Math.cos(tilt) - y * Math.sin(tilt),
      y: cy + x * Math.sin(tilt) + y * Math.cos(tilt),
    }
  })
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
 * Петля у края экрана прижимается к нему, а не уходит за край: часы в строке меню обведены
 * сплющенной сверху петлёй, а не обрезанной. margin - половина толщины линии.
 */
export const keepInside = (
  points: readonly MarkPoint[],
  width: number,
  height: number,
  margin: number,
): MarkPoint[] =>
  points.map((point) => ({
    x: clamp(point.x, margin, Math.max(margin, width - margin)),
    y: clamp(point.y, margin, Math.max(margin, height - margin)),
  }))

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
 * Затемнение всего окна с вырезом вокруг области: внешний прямоугольник и скруглённый вырез,
 * заливка по правилу evenodd.
 */
export const spotlightPath = (width: number, height: number, box: MarkBox): string => {
  const x = box.x - SPOTLIGHT_PAD
  const y = box.y - SPOTLIGHT_PAD
  const w = box.width + SPOTLIGHT_PAD * 2
  const h = box.height + SPOTLIGHT_PAD * 2
  const r = Math.min(SPOTLIGHT_RADIUS, w / 2, h / 2)
  const hole = [
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

  return `M0 0 H${fixed(width)} V${fixed(height)} H0 Z ${hole}`
}

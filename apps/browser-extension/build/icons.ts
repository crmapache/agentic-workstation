import { crc32, deflateSync } from 'node:zlib'

/**
 * Значок расширения рисуется при сборке, а не лежит картинкой в git: тот же наконечник курсора,
 * что едет по странице (src/overlay/overlay.utils.ts), - акцентом, со светлым тонким контуром и
 * мягким свечением на графитовой плитке. Цвета - из токенов дизайн-системы.
 */

export const ICON_SIZES = [16, 32, 48, 128] as const

type Rgb = readonly [number, number, number]

type Point = readonly [number, number]

/**
 * Наконечник в долях стороны значка - сердцевина без скругления: острие, правый угол, выемка,
 * нижний угол. Скругление углов даёт ROUND - всё, что ближе него к сердцевине, - стрелка.
 * Чуть правее и ниже середины: у наконечника вес внизу справа, так он на глаз по центру.
 */
const POINTER: readonly Point[] = [
  [0.27, 0.25],
  [0.81, 0.49],
  [0.57, 0.57],
  [0.49, 0.81],
]

const ROUND = 0.035
/** Светлый контур стрелки - тонкий, как у курсора на странице. */
const RIM = 0.022
/** Свечение вокруг: доля акцента у самого края и как быстро гаснет. */
const GLOW_STRENGTH = 0.6
const GLOW_REACH = 0.075

/** Сглаживание: столько точек на сторону пикселя. */
const SAMPLES = 4

const CORNER = 0.22

export const hexColor = (value: string): Rgb => {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim())

  if (!match?.[1]) throw new Error(`Icon color must be #rrggbb, got ${value}`)

  const hex = match[1]

  return [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as unknown as Rgb
}

const insidePolygon = ([x, y]: Point, polygon: readonly Point[]): boolean => {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i] as Point
    const [xj, yj] = polygon[j] as Point

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }

  return inside
}

/** Расстояние от точки до отрезка. */
const toSegment = ([x, y]: Point, [ax, ay]: Point, [bx, by]: Point): number => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))

  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

/** Насколько точка снаружи скруглённого наконечника; внутри - 0 и меньше. */
export const pointerDistance = (point: Point): number => {
  if (insidePolygon(point, POINTER)) return -ROUND

  let nearest = Number.POSITIVE_INFINITY

  for (let i = 0; i < POINTER.length; i += 1) {
    const from = POINTER[i] as Point
    const to = POINTER[(i + 1) % POINTER.length] as Point

    nearest = Math.min(nearest, toSegment(point, from, to))
  }

  return nearest - ROUND
}

const insideRoundedSquare = ([x, y]: Point): boolean => {
  const cx = Math.min(Math.max(x, CORNER), 1 - CORNER)
  const cy = Math.min(Math.max(y, CORNER), 1 - CORNER)

  return (x - cx) ** 2 + (y - cy) ** 2 <= CORNER ** 2
}

const mix = (from: Rgb, to: Rgb, amount: number): [number, number, number] => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
]

/** Цвет одной точки значка: плитка, свечение, контур, стрелка. */
const colorAt = (point: Point, background: Rgb, accent: Rgb, rim: Rgb): Rgb => {
  const distance = pointerDistance(point)

  if (distance <= -RIM) return accent
  if (distance <= 0) return rim

  return mix(background, accent, GLOW_STRENGTH * Math.exp(-((distance / GLOW_REACH) ** 2)))
}

/** Пиксели RGBA: плитка фона, на ней светящаяся стрелка. */
export const drawIcon = (size: number, background: Rgb, accent: Rgb, rim: Rgb): Uint8Array => {
  const pixels = new Uint8Array(size * size * 4)

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let tile = 0
      const sum = [0, 0, 0]

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const point: Point = [
            (px + (sx + 0.5) / SAMPLES) / size,
            (py + (sy + 0.5) / SAMPLES) / size,
          ]

          if (!insideRoundedSquare(point)) continue

          const color = colorAt(point, background, accent, rim)

          tile += 1
          sum[0] = (sum[0] as number) + color[0]
          sum[1] = (sum[1] as number) + color[1]
          sum[2] = (sum[2] as number) + color[2]
        }
      }

      const total = SAMPLES * SAMPLES
      const offset = (py * size + px) * 4

      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = tile ? Math.round((sum[channel] as number) / tile) : 0
      }

      pixels[offset + 3] = Math.round((255 * tile) / total)
    }
  }

  return pixels
}

const chunk = (type: string, data: Uint8Array): Buffer => {
  const head = Buffer.alloc(8)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const tail = Buffer.alloc(4)

  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  tail.writeUInt32BE(crc32(body), 0)

  return Buffer.concat([head, data, tail])
}

/** PNG из RGBA: заголовок, данные без фильтров (байт 0 в начале строки), конец. */
export const encodePng = (size: number, rgba: Uint8Array): Buffer => {
  const header = Buffer.alloc(13)

  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.writeUInt8(8, 8)
  header.writeUInt8(6, 9)

  const rows = Buffer.alloc(size * (size * 4 + 1))

  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0
    Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(rows, y * (size * 4 + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', new Uint8Array(0)),
  ])
}

import { crc32, deflateSync } from 'node:zlib'

/**
 * Значок расширения рисуется при сборке, а не лежит картинкой в git: оранжевая стрелка
 * курсора агента на графитовой плитке, цвета - из токенов дизайн-системы.
 */

export const ICON_SIZES = [16, 32, 48, 128] as const

type Rgb = readonly [number, number, number]

type Point = readonly [number, number]

/** Стрелка курсора в долях стороны значка - та же, что едет по странице. */
const ARROW: readonly Point[] = [
  [0.3, 0.17],
  [0.3, 0.8],
  [0.45, 0.66],
  [0.55, 0.86],
  [0.64, 0.82],
  [0.54, 0.62],
  [0.74, 0.62],
]

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

const insideRoundedSquare = ([x, y]: Point): boolean => {
  const cx = Math.min(Math.max(x, CORNER), 1 - CORNER)
  const cy = Math.min(Math.max(y, CORNER), 1 - CORNER)

  return (x - cx) ** 2 + (y - cy) ** 2 <= CORNER ** 2
}

/** Пиксели RGBA: плитка фона, на ней стрелка. */
export const drawIcon = (size: number, background: Rgb, accent: Rgb): Uint8Array => {
  const pixels = new Uint8Array(size * size * 4)

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let tile = 0
      let arrow = 0

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const point: Point = [
            (px + (sx + 0.5) / SAMPLES) / size,
            (py + (sy + 0.5) / SAMPLES) / size,
          ]

          if (insideRoundedSquare(point)) tile += 1

          if (insidePolygon(point, ARROW)) arrow += 1
        }
      }

      const total = SAMPLES * SAMPLES
      const mix = arrow / total
      const offset = (py * size + px) * 4

      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(
          (background[channel] as number) * (1 - mix) + (accent[channel] as number) * mix,
        )
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

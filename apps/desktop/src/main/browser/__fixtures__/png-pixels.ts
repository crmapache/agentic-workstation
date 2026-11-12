import { inflateSync } from 'node:zlib'

/** Пиксели PNG (8 бит, RGB или RGBA) - для проверки картинки вкладки в сквозном тесте. */
export type Pixels = { width: number; height: number; at: (x: number, y: number) => number[] }

const paeth = (left: number, up: number, upLeft: number): number => {
  const p = left + up - upLeft
  const pa = Math.abs(p - left)
  const pb = Math.abs(p - up)
  const pc = Math.abs(p - upLeft)

  return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
}

export const decodePng = (png: Buffer): Pixels => {
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const channels = png[25] === 6 ? 4 : 3
  const data: Buffer[] = []

  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)

    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      data.push(png.subarray(offset + 8, offset + 8 + length))
    }

    offset += 12 + length
  }

  const raw = inflateSync(Buffer.concat(data))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? (out[y * stride + x - channels] ?? 0) : 0
      const up = y > 0 ? (out[(y - 1) * stride + x] ?? 0) : 0
      const upLeft = y > 0 && x >= channels ? (out[(y - 1) * stride + x - channels] ?? 0) : 0
      const predicted =
        [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upLeft)][filter] ?? 0

      out[y * stride + x] = ((raw[y * (stride + 1) + 1 + x] ?? 0) + predicted) & 0xff
    }
  }

  return {
    width,
    height,
    at: (x, y) => [...out.subarray(y * stride + x * channels, y * stride + x * channels + 3)],
  }
}

/** Акцентный оранжевый (--color-accent) с запасом на цветовой профиль экрана. */
export const isAccent = ([r = 0, g = 0, b = 0]: number[]): boolean =>
  r > 200 && g > 70 && g < 160 && b < 100

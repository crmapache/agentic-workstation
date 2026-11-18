import { join, extname, normalize, isAbsolute } from 'node:path'

import { PICTURE_EXTENSIONS } from './images.constants'

/** Тип картинки по расширению - для data URL; что не картинка - пусто. */
const TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

/** Тип картинки файла по его расширению; не картинка - пусто. */
export const pictureType = (path: string): string => {
  const extension = extname(path).slice(1).toLowerCase()

  return PICTURE_EXTENSIONS.has(extension) ? (TYPES[extension] ?? '') : ''
}

/**
 * Путь картинки из чипа - абсолютным: от «~», целиком или от корня проекта (так чип
 * пишет выбранную внутри проекта). null - не картинка по расширению или сетевой путь:
 * чип - сообщение, которое может назвать любой файл, а читать по нему можно только
 * картинку (как в ACC).
 */
export const picturePath = (root: string, home: string, path: string): string | null => {
  if (!path || path.includes('\0') || /^(\/\/|\\\\)/.test(path)) return null

  const absolute = path.startsWith('~/')
    ? join(home, path.slice(2))
    : isAbsolute(path)
      ? path
      : join(root, path)

  return pictureType(absolute) ? normalize(absolute) : null
}

/** Размер уменьшенной копии: длинная сторона - не больше edge, и ни одна не меньше пикселя. */
export const fittedSize = (
  width: number,
  height: number,
  edge: number,
): { width: number; height: number } => {
  const scale = Math.min(1, edge / Math.max(width, height, 1))

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

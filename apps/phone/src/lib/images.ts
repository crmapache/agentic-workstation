import { toBase64 } from '@agentic-workstation/remote-protocol/base64'
import type { IMAGE_TYPES } from '@agentic-workstation/remote-protocol/commands'
import { MAX_IMAGES, MAX_IMAGES_CHARS } from '@agentic-workstation/remote-protocol/message-size'

export { MAX_IMAGES }

export type ImageType = (typeof IMAGE_TYPES)[number]

/** Фото, готовое в сообщение: base64 для IDE и адрес превью для полоски над полем. */
export type PreparedImage = { id: string; mediaType: ImageType; data: string; preview: string }

/** Длинная сторона: больше модель всё равно ужмёт, а фото с камеры весит мегабайты. */
export const MAX_IMAGE_EDGE = 1568

export const JPEG_QUALITY = 0.85

/** GIF такого веса и размера уходит как есть: в нём бывает анимация, а EXIF у GIF нет. */
const KEEP_GIF_BYTES = 1_200_000

/**
 * Во что перерисовать картинку. Перерисовывается всегда, и небольшая тоже: файл с камеры несёт
 * EXIF - место съёмки (GPS), модель телефона, время, - и как есть он ушёл бы в IDE и дальше
 * модели. Холст пишет только пиксели. PNG - в PNG без потерь (скриншоты читаются лучше), прочее
 * - в JPEG; GIF - как есть, если он невелик (keep).
 */
export const encodingOf = (type: string): 'image/png' | 'image/jpeg' | 'keep' => {
  if (type === 'image/gif') return 'keep'
  if (type === 'image/png') return 'image/png'

  return 'image/jpeg'
}

const encode = async (blob: Blob): Promise<string> =>
  toBase64(new Uint8Array(await blob.arrayBuffer()))

const prepared = async (blob: Blob, mediaType: ImageType): Promise<PreparedImage> => ({
  id: crypto.randomUUID(),
  mediaType,
  data: await encode(blob),
  preview: URL.createObjectURL(blob),
})

/**
 * Фото с камеры или из галереи - в сообщение: поворот по EXIF (createImageBitmap), длинная
 * сторона до MAX_IMAGE_EDGE, перерисовка на холсте без метаданных. Не картинка или не
 * читается - null.
 */
export const prepareImage = async (file: File): Promise<PreparedImage | null> => {
  const bitmap = await createImageBitmap(file).catch(() => null)

  if (!bitmap) return null

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
  const encoding = encodingOf(file.type)

  if (encoding === 'keep' && scale === 1 && file.size <= KEEP_GIF_BYTES) {
    bitmap.close()

    return prepared(file, 'image/gif')
  }

  const canvas = document.createElement('canvas')
  const output = encoding === 'image/png' ? 'image/png' : 'image/jpeg'

  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, output, output === 'image/jpeg' ? JPEG_QUALITY : undefined),
  )

  return blob ? prepared(blob, output) : null
}

/** Влезают ли фото в одно сообщение - и числом, и весом: те же числа, что у схемы команды. */
export const imagesFit = (images: readonly PreparedImage[]): boolean =>
  images.length <= MAX_IMAGES &&
  images.reduce((sum, image) => sum + image.data.length, 0) <= MAX_IMAGES_CHARS

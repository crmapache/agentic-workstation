import { toBase64 } from '@agentic-workstation/remote-protocol/base64'
import { IMAGE_TYPES } from '@agentic-workstation/remote-protocol/commands'
import { MAX_ASSEMBLED_CHARS } from '@agentic-workstation/remote-protocol/parts'

export type ImageType = (typeof IMAGE_TYPES)[number]

/** Фото, готовое в сообщение: base64 для IDE и адрес превью для полоски над полем. */
export type PreparedImage = { id: string; mediaType: ImageType; data: string; preview: string }

/** Длинная сторона: больше модель всё равно ужмёт, а фото с камеры весит мегабайты. */
export const MAX_IMAGE_EDGE = 1568

export const JPEG_QUALITY = 0.85

/** Небольшую картинку (скриншот) - как есть: PNG без потерь читается лучше. */
const KEEP_AS_IS_BYTES = 1_200_000

/** Сколько фото в одном сообщении (схема команды). */
export const MAX_IMAGES = 6

/** Место под фото в сообщении частями: остальное - текст и конверт команды. */
export const IMAGE_BUDGET_CHARS = MAX_ASSEMBLED_CHARS - 64 * 1024

const imageType = (type: string): ImageType | null =>
  IMAGE_TYPES.find((known) => known === type) ?? null

const encode = async (blob: Blob): Promise<string> =>
  toBase64(new Uint8Array(await blob.arrayBuffer()))

/**
 * Фото с камеры или из галереи - в сообщение: поворот по EXIF (createImageBitmap), длинная
 * сторона до MAX_IMAGE_EDGE, JPEG. Не картинка или не читается - null.
 */
export const prepareImage = async (file: File): Promise<PreparedImage | null> => {
  const bitmap = await createImageBitmap(file).catch(() => null)

  if (!bitmap) return null

  const id = crypto.randomUUID()
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
  const type = imageType(file.type)

  if (type && scale === 1 && file.size <= KEEP_AS_IS_BYTES) {
    bitmap.close()

    return { id, mediaType: type, data: await encode(file), preview: URL.createObjectURL(file) }
  }

  const canvas = document.createElement('canvas')

  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )

  if (!blob) return null

  return {
    id,
    mediaType: 'image/jpeg',
    data: await encode(blob),
    preview: URL.createObjectURL(blob),
  }
}

/** Влезают ли фото в одно сообщение - и числом, и весом. */
export const imagesFit = (images: readonly PreparedImage[]): boolean =>
  images.length <= MAX_IMAGES &&
  images.reduce((sum, image) => sum + image.data.length, 0) <= IMAGE_BUDGET_CHARS

import type { ImageMediaType, ImageAttachment } from '@shared/conversation'
import { IMAGE_MEDIA_TYPES } from '@shared/conversation'

import { JPEG_QUALITY, MAX_IMAGE_EDGE, MAX_IMAGE_BYTES } from './images.constants'

/** Картинка, готовая к отправке, с превью для поля ввода. */
export type PreparedImage = ImageAttachment & { id: string; preview: string }

const isMediaType = (type: string): type is ImageMediaType =>
  IMAGE_MEDIA_TYPES.some((allowed) => allowed === type)

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('картинка не прочиталась'))
    reader.onerror = () => reject(reader.error ?? new Error('картинка не прочиталась'))
    reader.readAsDataURL(blob)
  })

/** Уменьшить и перекодировать: PNG, а если и он тяжёлый - JPEG. */
const reencode = async (bitmap: ImageBitmap, scale: number) => {
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  )

  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  const png = await canvas.convertToBlob({ type: 'image/png' })

  return png.size <= MAX_IMAGE_BYTES
    ? png
    : canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
}

let sequence = 0

/**
 * Картинка из буфера, перетаскивания или выбора файла - к отправке. Большую уменьшает
 * до MAX_IMAGE_EDGE, тяжёлую или чужого формата перекодирует; подходящую отдаёт как
 * есть, без потерь. Не картинка или битая - null.
 */
export const prepareImage = async (blob: Blob): Promise<PreparedImage | null> => {
  if (!blob.type.startsWith('image/')) return null

  const bitmap = await createImageBitmap(blob).catch(() => null)

  if (!bitmap) return null

  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const fits = scale === 1 && blob.size <= MAX_IMAGE_BYTES && isMediaType(blob.type)
    const output = fits ? blob : await reencode(bitmap, scale)
    const preview = await toDataUrl(output)
    const mediaType = isMediaType(output.type) ? output.type : 'image/png'

    sequence += 1

    return { id: `image-${sequence}`, mediaType, data: preview.split(',')[1] ?? '', preview }
  } finally {
    bitmap.close()
  }
}

import { nativeImage } from 'electron'

import type { ImageAttachment } from '@shared/claude'

import { THUMBNAIL_EDGE, THUMBNAIL_QUALITY } from './images.constants'

/**
 * Миниатюра картинки сообщения для ленты: JPEG по длинной стороне THUMBNAIL_EDGE. В
 * ленту едет только она - картинка целиком весит мегабайты и нужна, лишь когда её
 * открыли. Формат, который Electron не читает, - пустая строка: окно рисует значок.
 */
export const makeThumbnail = (image: ImageAttachment): string => {
  try {
    const picture = nativeImage.createFromBuffer(Buffer.from(image.data, 'base64'))

    if (picture.isEmpty()) return ''

    const { width, height } = picture.getSize()
    const scale = Math.min(1, THUMBNAIL_EDGE / Math.max(width, height))
    const small = picture.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      quality: 'good',
    })

    return `data:image/jpeg;base64,${small.toJPEG(THUMBNAIL_QUALITY).toString('base64')}`
  } catch (error) {
    console.warn('[claude] миниатюра не получилась:', error)

    return ''
  }
}

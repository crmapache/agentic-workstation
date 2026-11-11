import { nativeImage } from 'electron'

import { fittedSize } from './picture-fit'

/**
 * Уменьшенная копия картинки сообщения - для телефона (Remote Control): JPEG не больше edge
 * по длинной стороне. Целиком картинка весит мегабайты, а на телефон уходит одним кадром.
 * Формат, который Electron не читает, - null: телефон покажет миниатюру.
 */
export const shrinkPicture = (dataUrl: string, edge: number, quality: number): string | null => {
  try {
    const picture = nativeImage.createFromDataURL(dataUrl)

    if (picture.isEmpty()) return null

    const { width, height } = picture.getSize()
    const small = picture.resize({ ...fittedSize(width, height, edge), quality: 'good' })

    return `data:image/jpeg;base64,${small.toJPEG(quality).toString('base64')}`
  } catch (error) {
    console.warn('[remote] картинка для телефона не уменьшилась:', error)

    return null
  }
}

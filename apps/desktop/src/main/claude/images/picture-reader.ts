import { stat, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'

import { nativeImage } from 'electron'

import type { ImageAttachment } from '@shared/conversation'
import type { PictureView, PicturePlace } from '@shared/message-draft'

import {
  PREVIEW_EDGE,
  RAW_MAX_BYTES,
  FIT_ABOVE_BYTES,
  PREVIEW_QUALITY,
  PICTURE_FILE_MAX_BYTES,
} from '../../agents/images/images.constants'
import { fittedSize, picturePath, pictureType } from '../../agents/images/picture-fit'

/** Откуда главный процесс берёт картинки сообщений: очередь и транскрипт разговора. */
export type PictureHost = {
  /** Картинки сообщения очереди в порядке чипов; нет такого - пусто. */
  queued: (conversationId: string, queuedId: string) => readonly ImageAttachment[]
  /** Картинка отправленного сообщения из транскрипта (data URL); нет - null. */
  said: (conversationId: string, messageId: string, image: number) => Promise<string | null>
}

type PictureBytes = { bytes: Buffer; type: string }

const dataUrl = ({ bytes, type }: PictureBytes) => `data:${type};base64,${bytes.toString('base64')}`

const fromDataUrl = (url: string | null): PictureBytes | null => {
  const match = url ? /^data:([^;,]+);base64,(.*)$/s.exec(url) : null

  return match?.[1] && match[2] ? { type: match[1], bytes: Buffer.from(match[2], 'base64') } : null
}

/** Файл картинки по пути из чипа - только картинка по расширению и не больше потолка. */
const readPictureFile = async (root: string, path: string): Promise<PictureBytes | null> => {
  const absolute = picturePath(root, homedir(), path)
  const info = absolute ? await stat(absolute).catch(() => null) : null

  if (!absolute || !info?.isFile() || info.size > PICTURE_FILE_MAX_BYTES) return null

  return { bytes: await readFile(absolute), type: pictureType(absolute) }
}

/**
 * Картинка для окна. Целиком - как есть; превью большой - уменьшенная копия (PNG держит
 * прозрачность, остальное - JPEG), но с размером самой картинки: подпись под превью
 * говорит о ней, а не о копии. Чего Electron не разжимает - целиком до потолка.
 */
const viewOf = (picture: PictureBytes, whole: boolean): PictureView | null => {
  if (picture.type === 'image/svg+xml') return { data: dataUrl(picture), width: 0, height: 0 }

  const image = nativeImage.createFromBuffer(picture.bytes)

  if (image.isEmpty()) {
    return picture.bytes.length <= RAW_MAX_BYTES
      ? { data: dataUrl(picture), width: 0, height: 0 }
      : null
  }

  const { width, height } = image.getSize()

  if (whole || picture.bytes.length <= FIT_ABOVE_BYTES) {
    return { data: dataUrl(picture), width, height }
  }

  const small = image.resize({ ...fittedSize(width, height, PREVIEW_EDGE), quality: 'best' })
  const copy =
    picture.type === 'image/png'
      ? { bytes: small.toPNG(), type: 'image/png' }
      : { bytes: small.toJPEG(PREVIEW_QUALITY), type: 'image/jpeg' }

  return { data: dataUrl(copy), width, height }
}

/** Байты картинки по месту чипа: файл, сообщение очереди, строка транскрипта. */
const bytesOf = async (
  host: PictureHost,
  root: string,
  place: PicturePlace,
): Promise<PictureBytes | null> => {
  if (place.kind === 'file') return readPictureFile(root, place.path)

  if (place.kind === 'queued') {
    const image = host.queued(place.conversationId, place.queuedId)[place.image]

    return image ? { bytes: Buffer.from(image.data, 'base64'), type: image.mediaType } : null
  }

  return fromDataUrl(await host.said(place.conversationId, place.messageId, place.image))
}

/**
 * Картинка за чипом (как в ACC): превью под курсором или целиком для просмотра. Не нашлась,
 * не читается, не разжалась - null: окно скажет «нечего показать» словами.
 */
export const readPicture = async (
  host: PictureHost,
  root: string,
  place: PicturePlace,
  whole: boolean,
): Promise<PictureView | null> => {
  try {
    const picture = await bytesOf(host, root, place)

    return picture ? viewOf(picture, whole) : null
  } catch (error) {
    console.warn('[claude] картинка не прочиталась:', place.kind, error)

    return null
  }
}

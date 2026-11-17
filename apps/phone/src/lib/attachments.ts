import { toBase64 } from '@agentic-workstation/remote-protocol/base64'
import {
  MAX_FILES,
  MAX_IMAGES,
  MAX_IMAGES_CHARS,
} from '@agentic-workstation/remote-protocol/message-size'

import type { PreparedImage } from './images'

export { MAX_FILES }

/** Файл, готовый в сообщение: имя и base64. Пути на телефоне у него нет - его даст IDE. */
export type PreparedFile = { id: string; name: string; data: string }

/** Что уходит из поля: слова (цитаты уже сверху), фото и файлы. */
export type OutgoingMessage = { text: string; images: PreparedImage[]; files: PreparedFile[] }

/**
 * Самый тяжёлый файл, который ещё стоит читать: base64 раздувает байты на треть, а всё
 * сообщение - не тяжелее MAX_IMAGES_CHARS. Тяжелее - отказ сразу, без чтения в память.
 */
export const MAX_FILE_BYTES = Math.floor((MAX_IMAGES_CHARS * 3) / 4)

/** Картинка - то, что модель увидит глазами; остальное (и картинка, которую не прочесть) - файлом. */
export const isPicture = (file: File): boolean => file.type.startsWith('image/')

export const prepareFile = async (file: File): Promise<PreparedFile> => ({
  id: crypto.randomUUID(),
  name: file.name || 'file',
  data: toBase64(new Uint8Array(await file.arrayBuffer())),
})

/** Влезают ли вложения в одно сообщение: числом каждого вида и весом вместе - как у схемы. */
export const attachmentsFit = (
  images: readonly PreparedImage[],
  files: readonly PreparedFile[],
): boolean =>
  images.length <= MAX_IMAGES &&
  files.length <= MAX_FILES &&
  [...images, ...files].reduce((sum, one) => sum + one.data.length, 0) <= MAX_IMAGES_CHARS

/** Вложения - в аргументы команды; пустые поля не едут вовсе (IDE старше файлов их не знает). */
export const attachmentArgs = ({ images, files }: Pick<OutgoingMessage, 'images' | 'files'>) => ({
  ...(images.length > 0 && { images: images.map(({ mediaType, data }) => ({ mediaType, data })) }),
  ...(files.length > 0 && { files: files.map(({ name, data }) => ({ name, data })) }),
})

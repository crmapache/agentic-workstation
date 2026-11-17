import type { FileFailure, FileVersion } from './fs'

/**
 * Картинки, которые IDE показывает из файлов (просмотр Markdown, вкладка файла), - что
 * Chromium рисует в <img>, с типом для data URL. Главный процесс читает только их (по
 * расширению настоящего файла), окно по ним узнаёт ссылку на картинку. Map, а не объект: имя
 * `x.constructor` не найдёт тип в прототипе.
 */
export const PREVIEW_IMAGE_TYPES: ReadonlyMap<string, string> = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['avif', 'image/avif'],
  ['bmp', 'image/bmp'],
  ['ico', 'image/x-icon'],
  ['svg', 'image/svg+xml'],
])

/** Расширение файла строчными: после последней точки имени, у имени без точки - пусто. */
const extensionOf = (path: string): string => {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = name.lastIndexOf('.')

  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * Файл, который вкладка редактора показывает картинкой, а не кодом: картинка по расширению,
 * кроме SVG - он текст, его правят кодом. Одно правило на окно и главный процесс: по нему же
 * ссылка на картинку вне проекта открывается вкладкой, а не своей программой.
 */
export const opensAsImage = (path: string): boolean => {
  const extension = extensionOf(path)

  return extension !== 'svg' && PREVIEW_IMAGE_TYPES.has(extension)
}

/**
 * Картинка из файла - для просмотра Markdown и вкладки картинки. image - data URL, размер
 * файла в байтах, версия файла (окно присылает её следующим чтением, и тот же файл отвечает
 * unchanged, не пересылая байты) и настоящий путь от корня, если файл - ссылка внутри
 * проекта: по нему окно видит его правку. Остальное - почему картинки нет: просмотр пишет
 * причину на её месте, вкладка - вместо картинки.
 */
export type ProjectImageRead =
  | { kind: 'image'; data: string; size: number; version: FileVersion; realPath: string | null }
  | { kind: 'unchanged' }
  | { kind: 'missing' }
  | { kind: 'notImage' }
  | { kind: 'tooLarge'; size: number; limit: number }
  | { kind: 'failed'; reason: FileFailure }

/**
 * Картинка с сайта для просмотра Markdown, которую человек сам попросил показать.
 * image - data URL; missing - сайт ответил ошибкой; notImage - пришла не картинка;
 * failed - сеть, срок ожидания или адрес не https.
 */
export type WebImageRead =
  | { kind: 'image'; data: string }
  | { kind: 'missing' }
  | { kind: 'notImage' }
  | { kind: 'tooLarge'; size: number; limit: number }
  | { kind: 'failed' }

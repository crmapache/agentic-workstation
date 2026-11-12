import { PREVIEW_IMAGE_TYPES } from '@shared/preview-images'

import { pathParts, isOutsidePath } from '../../lib/path.utils'
import type { FilePlace } from '../../state/selection.store'
import type { PreviewLinkTarget, PreviewImageSource } from './markdown-preview.types'

const NONE = { kind: 'none' } as const

/** Схема адреса: `https:`, `mailto:`, `javascript:`. */
const SCHEME = /^[a-z][a-z\d+.-]*:/i

const WEB_URL = /^https?:\/\//i

/** Диск пути Windows: `C:`. */
const WINDOWS_DRIVE = /^[A-Za-z]:(?=[\\/])/

/** Вписанная картинка: только растровые и SVG, через <img> они ничего не исполняют. */
const IMAGE_DATA_URL = /^data:image\/[a-z\d.+-]+[;,]/i

/** Место в файле из якоря ссылки, как на GitHub: `#L10`, `#L10-L20`. */
const LINE_FRAGMENT = /^L(\d+)(?:-L(\d+))?$/

const decode = (text: string): string => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * Путь файла из ссылки в файле `filePath`: от его папки или от корня проекта (`/docs/a.md`,
 * как на GitHub). У файла вне проекта (абсолютный путь) и ответ абсолютный, а `/x` - путь от
 * корня диска: репозитория за ним никто не знает. У файла Windows корень - его диск, черта -
 * «\». null - ссылка уходит за корень.
 */
export const resolveFromFile = (filePath: string, target: string): string | null => {
  const outside = isOutsidePath(filePath)
  const drive = outside ? WINDOWS_DRIVE.exec(filePath)?.[0] : undefined
  const folder = pathParts(filePath)
    .slice(drive ? 1 : 0, -1)
    .filter(Boolean)
  const parts = target.startsWith('/') ? [] : folder

  for (const part of decode(target).split('/')) {
    if (part === '..') {
      if (parts.length === 0) return null

      parts.pop()
    } else if (part !== '' && part !== '.') {
      parts.push(part)
    }
  }

  if (parts.length === 0) return null
  if (drive) return `${drive}\\${parts.join('\\')}`

  return outside ? `/${parts.join('/')}` : parts.join('/')
}

const placeOf = (fragment: string): FilePlace | undefined => {
  const match = LINE_FRAGMENT.exec(fragment)

  if (!match) return undefined

  const line = Number(match[1])

  return match[2] === undefined ? { line } : { line, endLine: Number(match[2]) }
}

/**
 * Куда ведёт ссылка из просмотра файла `filePath`. Сайт - в браузер; «#раздел» - к
 * заголовку; путь - файл или папка проекта (с местом из `#L10`); остальные схемы
 * (file, javascript, mailto) и адреса без схемы (`//host`) - никуда.
 */
export const linkTarget = (href: string, filePath: string): PreviewLinkTarget => {
  const link = href.trim()

  if (link.startsWith('#')) return { kind: 'anchor', id: decode(link.slice(1)) }
  if (SCHEME.test(link)) return WEB_URL.test(link) ? { kind: 'web', url: link } : NONE
  if (link.startsWith('//')) return NONE

  const hash = link.indexOf('#')
  const address = (hash < 0 ? link : link.slice(0, hash)).split('?')[0] ?? ''
  const path = address ? resolveFromFile(filePath, address) : null

  return path ? { kind: 'file', path, place: placeOf(hash < 0 ? '' : link.slice(hash + 1)) } : NONE
}

/**
 * Откуда картинка из просмотра файла `filePath`. Сайт - только https, вписанная - только
 * data:image. Путь - файл проекта, его читает главный процесс.
 */
export const imageSource = (src: string, filePath: string): PreviewImageSource => {
  const address = src.trim()

  if (/^https:\/\//i.test(address)) return { kind: 'web', url: address }
  if (IMAGE_DATA_URL.test(address)) return { kind: 'inline', url: address }

  if (SCHEME.test(address) || address.startsWith('//')) return NONE

  const file = address.split(/[?#]/)[0] ?? ''
  const path = file ? resolveFromFile(filePath, file) : null

  return path ? { kind: 'project', path } : NONE
}

/** Путь ведёт на картинку, которую просмотр умеет показать: ссылка открывает её крупно. */
export const isPreviewImagePath = (path: string): boolean =>
  PREVIEW_IMAGE_TYPES.has(path.slice(path.lastIndexOf('.') + 1).toLowerCase())

/** Адреса картинок с сайтов среди картинок файла `filePath` - без повторов. */
export const webImageUrls = (sources: readonly string[], filePath: string): string[] => [
  ...new Set(
    sources.flatMap((src) => {
      const source = imageSource(src, filePath)

      return source.kind === 'web' ? [source.url] : []
    }),
  ),
]

/** Якорь заголовка, как у GitHub: строчные, без знаков, пробел - дефис. */
export const slugify = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')

/** Якоря заголовков одного файла: повтор получает номер, как у GitHub (`intro-1`). */
export const createSlugger = (): ((text: string) => string) => {
  const seen = new Map<string, number>()

  return (text) => {
    const base = slugify(text)
    const count = seen.get(base) ?? 0

    seen.set(base, count + 1)

    return count === 0 ? base : `${base}-${count}`
  }
}

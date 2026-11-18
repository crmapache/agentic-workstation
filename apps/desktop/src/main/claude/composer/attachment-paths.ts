import { stat } from 'node:fs/promises'
import { sep, extname, relative, isAbsolute } from 'node:path'

import type { AttachmentPath } from '@shared/claude-draft'

import { PICTURE_EXTENSIONS } from '../../agents/images/images.constants'
import { MAX_ATTACH_PATHS } from './composer.constants'

/** Картинка по расширению - её чип показывает картинку, а модель читает файл. */
export const isPicturePath = (path: string): boolean =>
  PICTURE_EXTENSIONS.has(extname(path).slice(1).toLowerCase())

/**
 * Путь для чипа: внутри проекта - от корня, как пишет его CLI в «@», снаружи (загрузки,
 * рабочий стол) - целиком.
 */
export const chipPath = (root: string, absolute: string): string => {
  const inside = relative(root, absolute)

  return inside && !inside.startsWith('..') && !isAbsolute(inside)
    ? inside.split(sep).join('/')
    : absolute
}

/**
 * Что за пути пришли из диалога или перетаскивания: файл, картинка или папка. Только
 * абсолютные и существующие: окну не верим, а несуществующий путь ничего не прикладывает.
 */
export const describePaths = async (
  root: string,
  paths: readonly string[],
): Promise<AttachmentPath[]> => {
  const found = await Promise.all(
    paths.slice(0, MAX_ATTACH_PATHS).map(async (path): Promise<AttachmentPath | null> => {
      if (!isAbsolute(path) || path.includes('\0')) return null

      const info = await stat(path).catch(() => null)

      if (!info) return null
      if (info.isDirectory()) return { path: `${chipPath(root, path)}/`, kind: 'dir' }

      return { path: chipPath(root, path), kind: isPicturePath(path) ? 'img' : 'file' }
    }),
  )

  return found.filter((item): item is AttachmentPath => item !== null)
}

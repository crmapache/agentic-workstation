import { constants } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { open, stat, realpath } from 'node:fs/promises'
import { extname } from 'node:path'

import type { FileVersion } from '@shared/fs'
import { PREVIEW_IMAGE_TYPES } from '@shared/preview-images'
import type { ProjectImageRead } from '@shared/preview-images'

import { IMAGE_FILE_MAX_BYTES } from './image-file.constants'
import { outsidePath } from './path-location'
import { resolveInsideRoot } from './project-paths'
import { MISSING_CODES } from './text-file.constants'
import { errorCode, failureOf, versionOf, relativeInside } from './text-file.utils'

const MISSING: ProjectImageRead = { kind: 'missing' }

const typeOf = (path: string): string | null =>
  PREVIEW_IMAGE_TYPES.get(extname(path).slice(1).toLowerCase()) ?? null

/**
 * Байты файла, но не больше, чем его размер при открытии: файл, который растёт прямо
 * сейчас (скриншот ещё пишется), не прочитается мимо потолка. null - он вырос за чтение.
 */
const readExactly = async (handle: FileHandle, size: number): Promise<Buffer | null> => {
  const buffer = Buffer.alloc(size + 1)
  let total = 0

  while (total < buffer.length) {
    const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total)

    if (bytesRead === 0) break

    total += bytesRead
  }

  return total > size ? null : buffer.subarray(0, total)
}

const readImage = async (
  handle: FileHandle,
  type: string,
  known: FileVersion | null,
  realPath: string | null,
): Promise<ProjectImageRead> => {
  const info = await handle.stat({ bigint: true })
  const size = Number(info.size)

  if (!info.isFile()) return MISSING
  if (size > IMAGE_FILE_MAX_BYTES) {
    return { kind: 'tooLarge', size, limit: IMAGE_FILE_MAX_BYTES }
  }

  const version = versionOf(info)

  if (known !== null && version === known) return { kind: 'unchanged' }

  const bytes = await readExactly(handle, size)

  // Вырос за чтение - следующее событие диска прочитает его заново, уже целиком.
  if (!bytes) return { kind: 'failed', reason: 'unknown' }

  return {
    kind: 'image',
    data: `data:${type};base64,${bytes.toString('base64')}`,
    size,
    version,
    realPath,
  }
}

/**
 * Прочитать картинку по настоящему пути: тип - по расширению настоящего файла и названного
 * (`logo.png`, ведущий ссылкой на `.env`, не картинка). Открытие - без ожидания: канал FIFO с
 * именем картинки не займёт поток главного процесса.
 */
const readRealImage = async (
  realFile: string,
  namedPath: string,
  known: FileVersion | null,
  realPath: string | null,
): Promise<ProjectImageRead> => {
  const type = typeOf(realFile)

  if (!type || !typeOf(namedPath)) return { kind: 'notImage' }

  const handle = await open(realFile, constants.O_RDONLY | constants.O_NONBLOCK)

  try {
    return await readImage(handle, type, known, realPath)
  } finally {
    await handle.close()
  }
}

/** Ошибка чтения - видом: файла нет или причина, которую окно скажет словами. */
const failedRead = (error: unknown, label: string): ProjectImageRead =>
  MISSING_CODES.has(errorCode(error))
    ? MISSING
    : { kind: 'failed', reason: failureOf(error, label) }

/**
 * Картинка проекта - для просмотра Markdown и вкладки картинки. Путь просмотру пишет файл
 * Markdown, то есть чужой текст из репозитория, поэтому читается только картинка (по
 * расширению настоящего файла и названного), только внутри проекта (и ссылка не уводит за
 * него) и не больше потолка. known - версия, которую окно уже держит: совпала - unchanged,
 * байты не читаются.
 */
export const readImageFile = async (
  rootPath: string,
  relativePath: string,
  known: FileVersion | null = null,
): Promise<ProjectImageRead> => {
  const absolute = resolveInsideRoot(rootPath, relativePath)

  if (absolute === null) return { kind: 'failed', reason: 'outside' }

  try {
    const [realRoot, realFile] = await Promise.all([realpath(rootPath), realpath(absolute)])
    const realRelative = relativeInside(realRoot, realFile)

    if (realRelative === null) return { kind: 'failed', reason: 'outside' }

    return await readRealImage(
      realFile,
      relativePath,
      known,
      realRelative === relativePath ? null : realRelative,
    )
  } catch (error) {
    return failedRead(error, relativePath)
  }
}

/**
 * Картинка вне проекта - вкладкой по ссылке из ленты (ADR 0027) или в просмотре Markdown,
 * который сам лежит вне проекта. Путь проверяется заново (outsidePath); дальше - те же
 * проверки, что у картинки проекта: только картинка и не больше потолка.
 */
export const readOutsideImageFile = async (
  path: string,
  known: FileVersion | null = null,
): Promise<ProjectImageRead> => {
  const absolute = outsidePath(path)

  if (absolute === null) return { kind: 'failed', reason: 'outside' }

  try {
    return await readRealImage(await realpath(absolute), absolute, known, null)
  } catch (error) {
    return failedRead(error, path)
  }
}

/**
 * Картинка вне проекта влезет во вкладку: обычный файл не больше потолка. Большую честнее
 * отдать её программе, чем показать «велика».
 */
export const fitsImageTab = async (absolute: string): Promise<boolean> => {
  try {
    const info = await stat(absolute)

    return info.isFile() && info.size <= IMAGE_FILE_MAX_BYTES
  } catch {
    return false
  }
}

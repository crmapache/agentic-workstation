import { stat, realpath } from 'node:fs/promises'
import { extname } from 'node:path'

import { shell } from 'electron'

import { IS_WINDOWS } from '../platform'
import {
  RUNNABLE_EXTENSIONS,
  EXECUTABLE_MODE_BITS,
  WINDOWS_OPENABLE_EXTENSIONS,
} from './outside-open.constants'
import { outsidePath } from './path-location'

/**
 * Имя запускаемого: программа, скрипт, установщик, ярлык. На Windows - всё, что не документ
 * из белого списка (WINDOWS_OPENABLE_EXTENSIONS).
 */
const isRunnableName = (name: string) => {
  const extension = extname(name).toLowerCase()

  return IS_WINDOWS
    ? !WINDOWS_OPENABLE_EXTENSIONS.has(extension)
    : RUNNABLE_EXTENSIONS.has(extension)
}

/**
 * Можно ли отдать файл системе «открыть»: не программа, не скрипт, не установщик, не
 * ярлык. Имена проверяются все - написанное и настоящее: ссылка `notes.txt` на
 * `run.command` откроется как `run.command`.
 */
export const opensSafely = (names: readonly string[], mode: number): boolean =>
  (mode & EXECUTABLE_MODE_BITS) === 0 && names.every((name) => !isRunnableName(name))

/**
 * Файл или папка вне проекта - системой. Папка и всё, что система запустила бы, а не
 * открыла, только показывается в Finder; обычный файл открывается своей программой, а
 * если программы нет - тоже показывается. Путь окну не верим: он проверяется заново -
 * абсолютный, не сетевой, существует. false - показывать нечего.
 */
export const openOutside = async (path: string, reveal: boolean): Promise<boolean> => {
  const target = outsidePath(path)

  if (target === null) return false

  const info = await stat(target).catch(() => null)

  if (!info) return false

  const real = await realpath(target).catch(() => target)

  if (reveal || !info.isFile() || !opensSafely([target, real], info.mode)) {
    shell.showItemInFolder(target)

    return true
  }

  const failure = await shell.openPath(target)

  if (failure) {
    console.warn('[fs] файл вне проекта не открылся, показываю в Finder:', failure)
    shell.showItemInFolder(target)
  }

  return true
}

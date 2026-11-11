import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'

import { shell } from 'electron'

import { CHROME_EXTENSIONS_URL } from '@shared/connectors'

/** Chrome: стандартное имя приложения в /Applications. */
const CHROME_APP = 'Google Chrome'

/**
 * Папка расширения в Finder - выделенной в её родителе: в «Load unpacked» человек выбирает
 * именно её. Папки нет (мост не ставился) - false.
 */
export const revealExtensionFolder = (dir: string | null): boolean => {
  if (!dir || !existsSync(dir)) return false

  shell.showItemInFolder(dir)

  return true
}

/**
 * chrome://extensions в Google Chrome. Электрон такие адреса наружу не открывает
 * (shell.openExternal только для сайтов), поэтому - `open -a`: macOS передаёт адрес самому
 * Chrome. Chrome не установлен или не принял - false, окно копирует адрес.
 */
export const openChromeExtensions = (): Promise<boolean> =>
  new Promise((resolve) => {
    execFile('open', ['-a', CHROME_APP, CHROME_EXTENSIONS_URL], (error) => resolve(!error))
  })

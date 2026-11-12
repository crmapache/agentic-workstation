import { spawn, execFile } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { shell } from 'electron'

import { CHROME_EXTENSIONS_URL } from '@shared/connectors'

import { IS_WINDOWS } from '../platform'
import { SHOWS_WINDOW } from '../windows/console-hide'

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
 * chrome.exe на Windows - там, куда его ставит установщик Chrome: на всю машину или в профиль
 * человека. Нет ни там, ни там - null.
 */
const windowsChrome = (): string | null =>
  [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['LOCALAPPDATA']]
    .filter((dir): dir is string => Boolean(dir))
    .map((dir) => join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    .find((file) => existsSync(file)) ?? null

/**
 * chrome://extensions в Google Chrome. Электрон такие адреса наружу не открывает
 * (shell.openExternal только для сайтов), поэтому - `open -a`: macOS передаёт адрес самому
 * Chrome; на Windows - сам chrome.exe с адресом. Chrome не установлен или не принял - false,
 * окно копирует адрес.
 */
export const openChromeExtensions = (): Promise<boolean> =>
  new Promise((resolve) => {
    if (IS_WINDOWS) {
      const chrome = windowsChrome()

      if (!chrome) {
        resolve(false)

        return
      }

      const options = { detached: true, stdio: 'ignore', [SHOWS_WINDOW]: true } as SpawnOptions
      const child = spawn(chrome, [CHROME_EXTENSIONS_URL], options)

      child.once('error', () => resolve(false))
      child.once('spawn', () => {
        child.unref()
        resolve(true)
      })

      return
    }

    execFile('open', ['-a', CHROME_APP, CHROME_EXTENSIONS_URL], (error) => resolve(!error))
  })

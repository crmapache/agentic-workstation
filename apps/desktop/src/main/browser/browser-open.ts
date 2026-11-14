import { spawn, execFile } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { shell } from 'electron'

import { CHROME_EXTENSIONS_URL } from '@shared/connectors'

import { IS_MAC, IS_WINDOWS } from '../platform'
import { SHOWS_WINDOW } from '../windows/console-hide'
import { macBrowserApp } from './browser-places'

/** Chrome: стандартное имя приложения в /Applications. */
const CHROME_APP = 'Google Chrome'

/** Раздел «Полный доступ к диску» настроек macOS. */
const DISK_ACCESS_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'

/**
 * «Полный доступ к диску» в настройках macOS: без него IDE не прочтёт имена профилей Chrome
 * (ADR 0052). Адрес - постоянный, свой, а не пришедший извне. Не macOS - false.
 */
export const openDiskAccessSettings = (): Promise<boolean> =>
  IS_MAC
    ? shell.openExternal(DISK_ACCESS_PANE).then(
        () => true,
        () => false,
      )
    : Promise.resolve(false)

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
 * Окно браузера в нужном профиле (ADR 0053): `--profile-directory` с папкой профиля - Chrome,
 * если уже запущен, открывает окно этого профиля, иначе стартует с ним. На маке - через `open`
 * приложением этой папки данных, на Windows - chrome.exe. Не открылось - false.
 */
export const openBrowserProfile = (dataDir: string, profileDir: string): Promise<boolean> =>
  new Promise((resolve) => {
    const flag = `--profile-directory=${profileDir}`

    if (IS_WINDOWS) {
      const chrome = /Google[\\/]Chrome[\\/]User Data$/.test(dataDir) ? windowsChrome() : null

      if (!chrome) {
        resolve(false)

        return
      }

      const options = { detached: true, stdio: 'ignore', [SHOWS_WINDOW]: true } as SpawnOptions
      const child = spawn(chrome, [flag], options)

      child.once('error', () => resolve(false))
      child.once('spawn', () => {
        child.unref()
        resolve(true)
      })

      return
    }

    const app = macBrowserApp(dataDir)

    if (!app) {
      resolve(false)

      return
    }

    execFile('open', ['-na', app, '--args', flag], (error) => resolve(!error))
  })

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

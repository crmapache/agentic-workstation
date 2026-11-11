import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { app } from 'electron'

import { PROFILE_DIR_ENV } from '../app-profile'
import { browserPlaces, HOSTS_DIR_ENV } from './browser-places'
import { BrowserRuntime } from './browser-runtime'
import { browserManifestDirs } from './native-host-install'
import type { BridgeSource } from './native-host-install'

/**
 * Откуда брать host и расширение: в приложении - ресурсы (electron-builder, extraResources),
 * в dev и в копии окна агента - рядом с собранным main (`<out>/native-host`,
 * `<out>/chrome-extension`, их кладёт сборка). Чего-то нет - null.
 */
const bridgeSource = (): BridgeSource | null => {
  const dir = app.isPackaged ? process.resourcesPath : join(__dirname, '..')
  const hostJs = join(dir, 'native-host', 'host.js')
  const extensionDir = join(dir, 'chrome-extension')

  return existsSync(hostJs) && existsSync(join(extensionDir, 'manifest.json'))
    ? { hostJs, extensionDir }
    : null
}

/**
 * Куда класть манифесты host. Переменная теста - только туда. Отдельный профиль (копия окна
 * агента, проверка обновления) браузеры человека не трогает вовсе: иначе он перехватил бы мост
 * его dev. Иначе - все установленные браузеры семейства Chromium.
 */
const manifestDirs = (): string[] => {
  const override = process.env[HOSTS_DIR_ENV]

  if (override) return [override]

  if (process.env[PROFILE_DIR_ENV]) return []

  return browserManifestDirs(app.getPath('appData'))
}

/** Мост браузера этой IDE (ADR 0040); changed - разослать окну новое состояние коннекторов. */
export const createBrowserRuntime = (changed: () => void): BrowserRuntime =>
  new BrowserRuntime({
    places: browserPlaces({
      home: app.getPath('home'),
      tmp: tmpdir(),
      isPackaged: app.isPackaged,
      profileDir: process.env[PROFILE_DIR_ENV],
    }),
    source: bridgeSource,
    execPath: process.execPath,
    ideVersion: app.getVersion(),
    manifestDirs,
    changed,
  })

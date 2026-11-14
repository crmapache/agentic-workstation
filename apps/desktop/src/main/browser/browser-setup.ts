import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

import { app } from 'electron'

import { EXTENSION_ID } from '@agentic-workstation/browser-protocol/extension-id'

import { PROFILE_DIR_ENV } from '../app-profile'
import { openBrowserProfile } from './browser-open'
import { browserPlaces, HOSTS_DIR_ENV, chromiumDataDirs } from './browser-places'
import { BrowserRuntime } from './browser-runtime'
import { findProfilePlace, findChromeProfile, listChromeProfiles } from './chrome-profiles'
import type { ProfileOpening } from './chrome-profiles'
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

/**
 * Где искать профиль Chrome копии расширения. В тесте папка манифестов лежит внутри папки
 * данных его Chromium - её он и читает. Файлы браузеров человека только читаются.
 */
const dataDirs = (): string[] => {
  const override = process.env[HOSTS_DIR_ENV]

  return override
    ? [dirname(override)]
    : chromiumDataDirs({
        appData: app.getPath('appData'),
        localAppData: process.env['LOCALAPPDATA'],
      })
}

/**
 * Открыть окно браузера в закрытом профиле (ADR 0053): только профиль, который есть у человека
 * в Local State, и только с нашим расширением - иначе открывать незачем.
 */
const openProfile = async (name: string): Promise<ProfileOpening> => {
  const place = await findProfilePlace(dataDirs(), EXTENSION_ID, name)

  if (!place) return 'unknown'

  if (!place.hasExtension) return 'no-extension'

  return (await openBrowserProfile(place.dataDir, place.dir)) ? 'opened' : 'failed'
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
    identify: (profileKey) => findChromeProfile(dataDirs(), EXTENSION_ID, profileKey),
    listProfiles: () => listChromeProfiles(dataDirs(), EXTENSION_ID),
    openProfile,
    changed,
  })

import { join } from 'node:path'

import { app } from 'electron'

/**
 * Папка отдельного профиля: своё состояние (userData) и свои журналы. Нужна, чтобы
 * собранную IDE можно было запустить рядом с установленной и не задеть её -
 * так работает scripts/update-e2e.sh.
 */
export const PROFILE_DIR_ENV = 'AGENTIC_WORKSTATION_PROFILE_DIR'

/**
 * Выбирает, где IDE хранит состояние. Звать до app.whenReady: от userData зависит
 * и блокировка второго экземпляра. Возвращает папку профиля, если она задана.
 *
 * Без профиля dev всё равно живёт отдельно от установленной IDE: иначе, пока
 * открыта установленная (а в ней эту IDE и разрабатывают), dev молча закрывался
 * бы как «второй экземпляр».
 */
export const applyAppProfile = (): string | undefined => {
  const profileDir = process.env[PROFILE_DIR_ENV]

  if (profileDir) {
    app.setPath('userData', join(profileDir, 'user-data'))
    app.setAppLogsPath(join(profileDir, 'logs'))

    return profileDir
  }

  if (!app.isPackaged) app.setPath('userData', `${app.getPath('userData')} Dev`)

  return undefined
}

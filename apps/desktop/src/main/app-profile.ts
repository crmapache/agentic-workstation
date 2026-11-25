import { join } from 'node:path'

import { app } from 'electron'

/**
 * Папка отдельного профиля: своё состояние (userData) и свои журналы. Нужна, чтобы
 * собранную IDE можно было запустить рядом с установленной и не задеть её -
 * так работает scripts/update-e2e.sh.
 */
export const PROFILE_DIR_ENV = 'AGENTIC_WORKSTATION_PROFILE_DIR'

/**
 * Окно копии, которую поднимает агент (scripts/agent-window.sh, scripts/update-e2e.sh), встаёт
 * сбоку: на мониторе, где человека нет, и без фокуса. Иначе каждая проверка агента выскакивала
 * поверх его работы (просьба владельца 2026-11-25). Значение - «1».
 */
export const WINDOW_ASIDE_ENV = 'AGENTIC_WORKSTATION_WINDOW_ASIDE'

/** Копия, которую поднял агент: её окно - сбоку, и после самообновления тоже. */
export const isWindowAside = (): boolean => process.env[WINDOW_ASIDE_ENV] === '1'

/**
 * С чем открыть новую версию после самообновления: тот же профиль и то же окно сбоку, что у
 * копии, в которой шло обновление. У обычной IDE - ничего.
 */
export const relaunchEnvOf = (profileDir: string | undefined): string[] => [
  ...(profileDir ? [`${PROFILE_DIR_ENV}=${profileDir}`] : []),
  ...(isWindowAside() ? [`${WINDOW_ASIDE_ENV}=1`] : []),
]

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
    // Отдельный профиль - копия для проверки (окно агента, update-e2e), и связку ключей
    // человека она не трогает: safeStorage берёт ключ «<имя> Safe Storage» из login keychain,
    // а запись установленной IDE с другой подписью macOS отдаёт только после окна «разрешить»,
    // которое некому нажать, - главный процесс стоял бы на нём. Ключ копии живёт в памяти, её
    // секреты не переживают перезапуск - для проверки это то, что нужно.
    app.commandLine.appendSwitch('use-mock-keychain')

    return profileDir
  }

  if (!app.isPackaged) app.setPath('userData', `${app.getPath('userData')} Dev`)

  return undefined
}

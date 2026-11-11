import { createHash } from 'node:crypto'
import { join } from 'node:path'

import type { HostChannel } from '@agentic-workstation/browser-protocol/protocol'

/**
 * Где живёт мост браузера одной IDE (ADR 0040). Всё - в ~/.agentic-workstation: путь без
 * пробелов (обёртку host запускает Chrome, папку расширения человек выбирает в «Load
 * unpacked») и не меняется между версиями IDE.
 */
export type BrowserPlaces = {
  channel: HostChannel
  /**
   * Сокет, к которому подключается host. null - ни в домашней, ни во временной папке путь не
   * укладывается в предел unix-сокета: мост не ставится, окно показывает причину.
   */
  socketPath: string | null
  /** Копия host.js и обёртка sh, которую запускает Chrome. */
  hostDir: string
  /** Копия собранного расширения - её человек ставит «Load unpacked». */
  extensionDir: string
}

/** У unix-сокета на macOS путь не длиннее 103 байт (sun_path - 104 с нулём). */
export const SOCKET_PATH_MAX = 103

export const BASE_DIR_NAME = '.agentic-workstation'

/** Папка сокета во временной папке пользователя, когда домашний путь слишком длинный. */
const TMP_SOCKET_DIR = 'agentic-workstation-browser'

const fits = (path: string): boolean => Buffer.byteLength(path) <= SOCKET_PATH_MAX

/**
 * Места этой IDE. Установленная - канал installed, dev - dev: обе могут быть запущены разом,
 * у каждой свой сокет и своё имя host. Отдельный профиль (AGENTIC_WORKSTATION_PROFILE_DIR -
 * копия окна агента, проверка обновления) получает свои сокет, host и папку расширения с
 * хешем профиля: он не должен перехватить мост человека.
 *
 * Не бросает: места считаются на старте коннекторов, и длинный домашний путь не должен ронять
 * запуск IDE. Сокет не влез в домашнюю папку - он во временной папке пользователя (на macOS
 * она своя у каждого, права 700; владельца и права ещё раз проверяет BrowserHub.start). Не
 * влез и туда - socketPath null, и мост отвечает кодом сбоя.
 */
export const browserPlaces = ({
  home,
  tmp,
  isPackaged,
  profileDir,
}: {
  home: string
  tmp: string
  isPackaged: boolean
  profileDir: string | undefined
}): BrowserPlaces => {
  const channel: HostChannel = isPackaged && !profileDir ? 'installed' : 'dev'
  const base = join(home, BASE_DIR_NAME)
  const tag = profileDir
    ? `${channel}-${createHash('sha256').update(profileDir).digest('hex').slice(0, 8)}`
    : channel
  const socketPath =
    [join(base, 'browser', `${tag}.sock`), join(tmp, TMP_SOCKET_DIR, `${tag}.sock`)].find(fits) ??
    null

  return {
    channel,
    socketPath,
    hostDir: join(base, 'native-host', tag),
    extensionDir: join(base, profileDir ? `chrome-extension-${tag}` : 'chrome-extension'),
  }
}

/**
 * Папки браузеров семейства Chromium в ~/Library/Application Support, куда Chrome смотрит за
 * манифестами native host (`<папка>/NativeMessagingHosts`). Arc держит её внутри User Data.
 */
export const CHROMIUM_BROWSERS = [
  'Google/Chrome',
  'Google/Chrome Beta',
  'Google/Chrome Dev',
  'Google/Chrome Canary',
  'Chromium',
  'BraveSoftware/Brave-Browser',
  'Microsoft Edge',
  'Arc/User Data',
  'Vivaldi',
] as const

/** Переменная для тестов: манифесты host - только в эту папку, браузеры человека не трогаются. */
export const HOSTS_DIR_ENV = 'AGENTIC_WORKSTATION_BROWSER_HOSTS_DIR'

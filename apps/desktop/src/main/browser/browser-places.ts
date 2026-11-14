import { createHash } from 'node:crypto'
import { join } from 'node:path'

import type { HostChannel } from '@agentic-workstation/browser-protocol/protocol'

import { IS_WINDOWS } from '../platform'

/**
 * Где живёт мост браузера одной IDE (ADR 0040). Служебное (сокет, host) - в скрытой
 * ~/.agentic-workstation: путь без пробелов (обёртку host запускает Chrome) и не меняется между
 * версиями IDE. Папку расширения человек сам выбирает в окне «Load unpacked» Chrome, а скрытую
 * папку там не найти, - она видимая, в домашней папке.
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
  /**
   * Где расширение лежало раньше (скрытая папка): если человек уже загрузил его оттуда, на
   * этом месте остаётся ссылка на новую папку - иначе Chrome отключил бы расширение.
   */
  legacyExtensionDir: string | null
}

/** У unix-сокета на macOS путь не длиннее 103 байт (sun_path - 104 с нулём). */
export const SOCKET_PATH_MAX = 103

export const BASE_DIR_NAME = '.agentic-workstation'

/** Видимая папка в домашней: её находят в окне выбора папки Chrome. */
export const VISIBLE_DIR_NAME = 'Agentic Workstation'

export const EXTENSION_DIR_NAME = 'Chrome Extension'

/** Папка сокета во временной папке пользователя, когда домашний путь слишком длинный. */
const TMP_SOCKET_DIR = 'agentic-workstation-browser'

const fits = (path: string): boolean => Buffer.byteLength(path) <= SOCKET_PATH_MAX

/**
 * Сокет на Windows - именованный канал (ADR 0048): unix-сокета с правами на файл там нет. Каналы
 * общие на всю машину, поэтому в имени - хеш домашней папки: у двух людей на одном компьютере
 * мосты не встретятся.
 */
const windowsPipe = (tag: string, home: string): string =>
  `\\\\.\\pipe\\agentic-workstation-browser-${tag}-${createHash('sha256').update(home).digest('hex').slice(0, 8)}`

/** Путь сокета - именованный канал Windows: у него нет папки, прав файла и старого файла. */
export const isWindowsPipe = (path: string): boolean => path.startsWith('\\\\.\\pipe\\')

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
  const socketPath = IS_WINDOWS
    ? windowsPipe(tag, home)
    : ([join(base, 'browser', `${tag}.sock`), join(tmp, TMP_SOCKET_DIR, `${tag}.sock`)].find(
        fits,
      ) ?? null)

  return {
    channel,
    socketPath,
    hostDir: join(base, 'native-host', tag),
    // Отдельный профиль - копия для проверки: её расширение человеку не нужно и в домашней
    // папке на виду мусорило бы.
    extensionDir: profileDir
      ? join(base, `chrome-extension-${tag}`)
      : join(home, VISIBLE_DIR_NAME, EXTENSION_DIR_NAME),
    legacyExtensionDir: profileDir ? null : join(base, 'chrome-extension'),
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

/**
 * Где браузеры Chromium на Windows ищут манифесты native host: не папка, а ключ реестра
 * `HKCU\…\NativeMessagingHosts\<имя>` со значением - путём к манифесту. Каналы Chrome (Beta, Dev,
 * Canary) читают ключ самого Chrome.
 */
export const WINDOWS_HOST_KEYS = [
  'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts',
  'HKCU\\Software\\Chromium\\NativeMessagingHosts',
  'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts',
  'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts',
] as const

/**
 * Папки данных браузеров Chromium на Windows (в %LOCALAPPDATA%): Local State и профили. На маке
 * это те же CHROMIUM_BROWSERS в Application Support.
 */
const WINDOWS_DATA_DIRS = [
  'Google/Chrome/User Data',
  'Google/Chrome Beta/User Data',
  'Google/Chrome Dev/User Data',
  'Google/Chrome SxS/User Data',
  'Chromium/User Data',
  'Microsoft/Edge/User Data',
  'BraveSoftware/Brave-Browser/User Data',
] as const

/**
 * Папки данных браузеров Chromium (там Local State и папки профилей) - где искать профиль, в
 * котором стоит копия расширения (chrome-profiles.ts). Только чтение.
 */
export const chromiumDataDirs = ({
  appData,
  localAppData,
}: {
  appData: string
  localAppData: string | undefined
}): string[] =>
  IS_WINDOWS
    ? localAppData
      ? WINDOWS_DATA_DIRS.map((dir) => join(localAppData, dir))
      : []
    : CHROMIUM_BROWSERS.map((browser) => join(appData, browser))

/**
 * Приложение браузера на маке по папке его данных - чтобы открыть окно нужного профиля
 * (`open -na <приложение> --args --profile-directory=…`). Arc папки профилей так не открывает.
 */
const MAC_BROWSER_APPS: Record<string, string> = {
  'Google/Chrome': 'Google Chrome',
  'Google/Chrome Beta': 'Google Chrome Beta',
  'Google/Chrome Dev': 'Google Chrome Dev',
  'Google/Chrome Canary': 'Google Chrome Canary',
  Chromium: 'Chromium',
  'BraveSoftware/Brave-Browser': 'Brave Browser',
  'Microsoft Edge': 'Microsoft Edge',
  Vivaldi: 'Vivaldi',
}

/** Приложение браузера по папке его данных (macOS); не знаем такого - null. */
export const macBrowserApp = (dataDir: string): string | null => {
  const found = Object.entries(MAC_BROWSER_APPS).find(([dir]) => dataDir.endsWith(`/${dir}`))

  return found?.[1] ?? null
}

/** Переменная для тестов: манифесты host - только в эту папку, браузеры человека не трогаются. */
export const HOSTS_DIR_ENV = 'AGENTIC_WORKSTATION_BROWSER_HOSTS_DIR'

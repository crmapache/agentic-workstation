import { definitionSecrets } from '../connector-secrets'
import type { ConnectorSecrets } from '../connector-secrets'
import type { StoredCommand, StoredConnector } from '../connector-store'
import { titleName } from '../connector-types'
import { SERVER_PREFIX } from '../connectors.constants'

/**
 * Как запускать Playwright MCP у одного подключения (ADR 0035). Под капотом - та же команда,
 * что человек писал руками в Claude Code: npx @playwright/mcp с флагами.
 */
export type PlaywrightOptions = {
  /**
   * Версия пакета: latest или закреплённая (0.0.78). Закрепляют, когда latest после
   * обновления кеша npx ломает браузер сохранённого профиля.
   */
  version: string
  /** Папка сохранённого профиля - входы на сайтах живут между разговорами; null - --isolated. */
  profileDir: string | null
  headless: boolean
}

const PACKAGE = '@playwright/mcp'

const VERSION = /^(latest|\d+\.\d+\.\d+[\w.-]*)$/

const PACKAGE_ARG = /^@playwright\/mcp(?:@(.+))?$/

/** Версия пакета, которую можно отдать npx: latest или номер, без лишних знаков. */
export const isPlaywrightVersion = (version: string): boolean => VERSION.test(version)

/** Команда запуска из настроек подключения. */
export const playwrightCommand = ({
  version,
  profileDir,
  headless,
}: PlaywrightOptions): StoredCommand => ({
  command: 'npx',
  args: [
    '-y',
    `${PACKAGE}@${version}`,
    ...(profileDir ? ['--user-data-dir', profileDir] : ['--isolated']),
    ...(headless ? ['--headless'] : []),
  ],
  cwd: null,
})

/**
 * Настройки Playwright из записанной команды - для переноса своих команд и импорта: npx
 * @playwright/mcp только с флагами, которые знает встроенный Playwright. Чистый профиль или
 * своя папка - ровно одно из двух: без обоих у Playwright свой общий профиль, его здесь не
 * выбрать. Что-то ещё (свои флаги, своя папка запуска) - null, команда остаётся своей.
 */
export const playwrightOptionsOf = (command: StoredCommand | null): PlaywrightOptions | null => {
  if (!command || command.command !== 'npx' || command.cwd) return null

  const [yes, pack, ...flags] = command.args
  const version = PACKAGE_ARG.exec(pack ?? '')?.[1] ?? (pack === PACKAGE ? 'latest' : null)

  if (yes !== '-y' || !version || !isPlaywrightVersion(version)) return null

  let profileDir: string | null = null
  let isolated = false
  let headless = false

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index]

    if (flag === '--headless') headless = true
    else if (flag === '--isolated') isolated = true
    else if (flag === '--user-data-dir' && flags[index + 1]) {
      index += 1
      profileDir = flags[index] ?? null
    } else return null
  }

  return isolated === Boolean(profileDir) ? null : { version, profileDir, headless }
}

/**
 * Своя команда, которая на деле Playwright MCP, - подключением встроенного Playwright (ADR
 * 0035): имя сервера и команда те же, подпись - из имени сервера (playwright-1 - 1,
 * notion-web - Notion Web). Команда с секретами (окружение, ключ в аргументах) остаётся
 * своей: встроенному Playwright их держать негде. Не Playwright - null.
 */
export const asPlaywright = (
  connector: StoredConnector,
  secrets: ConnectorSecrets,
): StoredConnector | null => {
  if (connector.kind !== 'command' || !playwrightOptionsOf(connector.command)) return null

  if (Object.keys(definitionSecrets(secrets)).length) return null

  const own = connector.serverName.startsWith(`${SERVER_PREFIX.playwright}-`)
    ? connector.serverName.slice(SERVER_PREFIX.playwright.length + 1)
    : connector.serverName

  return { ...connector, kind: 'playwright', typeId: null, label: titleName(own) }
}

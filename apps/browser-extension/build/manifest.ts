import { EXTENSION_PUBLIC_KEY } from '@agentic-workstation/browser-protocol/extension-id'

import { ICON_SIZES } from './icons'

/**
 * Разрешения - ровно то, чем расширение работает: отладчик (CDP во вкладках агента), вкладки и
 * группы, native messaging (связь с IDE), пункт меню, внедрение курсора, хранилище ключа
 * профиля, offscreen-документ, запись в буфер для ссылки на вкладку и будильник, который раз в
 * минуту будит сервис-воркер проверить связь с IDE.
 */
export const PERMISSIONS = [
  'debugger',
  'tabs',
  'tabGroups',
  'nativeMessaging',
  'contextMenus',
  'scripting',
  'storage',
  'offscreen',
  'clipboardWrite',
  'alarms',
] as const

/**
 * 125: стили берут токены дизайн-системы, а в них CSS round() (Chrome 125). Ниже - и
 * остальное, на чём стоит расширение: offscreen (109), порт native messaging держит
 * сервис-воркер живым (105), chrome.debugger и группы вкладок в сервис-воркере, popover для
 * слоя курсора (114).
 */
export const MINIMUM_CHROME = '125'

/** Цель сборки Vite: та же версия, что в манифесте, - сборка не тянет синтаксис новее неё. */
export const BUILD_TARGET = `chrome${MINIMUM_CHROME}`

const icons = (folder: string): Record<string, string> =>
  Object.fromEntries(ICON_SIZES.map((size) => [String(size), `${folder}/icon-${size}.png`]))

/**
 * Манифест MV3. key - открытый ключ: с ним id расширения постоянный (на нём держится
 * allowed_origins host). version_name несёт сборку - `0.1.0 (abc123)`: по ней расширение
 * узнаёт, что IDE положила в папку новую, и перезагружает себя (src/common/build-id.ts).
 */
export const extensionManifest = ({ version, build }: { version: string; build: string }) => ({
  manifest_version: 3,
  name: '__MSG_extName__',
  description: '__MSG_extDescription__',
  default_locale: 'en',
  version,
  version_name: `${version} (${build})`,
  key: EXTENSION_PUBLIC_KEY,
  minimum_chrome_version: MINIMUM_CHROME,
  permissions: [...PERMISSIONS],
  host_permissions: ['<all_urls>'],
  background: { service_worker: 'background.js', type: 'module' },
  action: {
    default_title: '__MSG_actionTitle__',
    default_popup: 'popup/popup.html',
    default_icon: icons('icons'),
  },
  icons: icons('icons'),
})

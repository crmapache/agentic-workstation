import { join } from 'node:path'

import { BrowserWindow } from 'electron'

import { IS_MAC } from '../platform'
import {
  MIN_WINDOW_SIZE,
  TITLE_BAR_HEIGHT,
  WINDOW_BACKGROUND,
  DEFAULT_WINDOW_SIZE,
} from './main-window.constants'
import { openExternalWeb } from './open-external'
import { installSpellMenu } from './spell-menu'
import { windowChrome } from './window-chrome'

/**
 * Главное окно IDE. Страница работает в песочнице без Node, а наружу ходит только
 * через мост preload. Ссылки на сайты открываются в браузере, а не внутри окна,
 * и никакая навигация не уводит окно со своей страницы.
 */
export const createMainWindow = (rendererUrl: string | undefined): BrowserWindow => {
  const window = new BrowserWindow({
    ...DEFAULT_WINDOW_SIZE,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    backgroundColor: WINDOW_BACKGROUND,
    // До замера шапки окном - по шапке обычного размера текста (window:setTitleBarHeight).
    ...windowChrome(TITLE_BAR_HEIGHT),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Проверка орфографии включена всегда: поля для прозы подчёркивают слова сами, у
      // полей имён и путей свой spellCheck={false}.
      spellcheck: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  // На Windows полосы меню нет: шапку рисует страница, а меню программы только держит
  // сочетания клавиш (main/menu.ts) - они работают и у спрятанного меню.
  if (!IS_MAC) window.setMenuBarVisibility(false)

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalWeb(url)

    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event) => event.preventDefault())
  installSpellMenu(window)

  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

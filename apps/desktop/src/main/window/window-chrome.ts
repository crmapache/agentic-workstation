import type { BrowserWindowConstructorOptions } from 'electron'

import { IS_MAC } from '../platform'
import { WINDOW_CONTROLS_COLOR, WINDOW_CONTROLS_SYMBOL_COLOR } from './main-window.constants'
import { trafficLightPosition } from './traffic-lights'

/**
 * Рамка окна без заголовка - шапку рисует страница. На маке «светофор» по середине шапки
 * слева, на Windows - системные кнопки окна справа той же высоты, что шапка (titleBarOverlay):
 * страница оставляет под них место по env(titlebar-area-*) (TitleBar).
 */
export const windowChrome = (titleBarHeight: number): BrowserWindowConstructorOptions =>
  IS_MAC
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: trafficLightPosition(titleBarHeight) }
    : { titleBarStyle: 'hidden', titleBarOverlay: windowControls(titleBarHeight) }

/** Кнопки окна Windows: подложка шапки, знаки тихим цветом, высота шапки. */
export const windowControls = (titleBarHeight: number) => ({
  color: WINDOW_CONTROLS_COLOR,
  symbolColor: WINDOW_CONTROLS_SYMBOL_COLOR,
  height: titleBarHeight,
})

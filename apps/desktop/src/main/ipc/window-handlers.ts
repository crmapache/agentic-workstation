import type { BrowserWindow } from 'electron'

import type { WindowInvokeContract } from '@shared/ipc/window.contract'

import { IS_MAC } from '../platform'
import { TITLE_BAR_HEIGHT_LIMITS } from '../window/main-window.constants'
import { trafficLightPosition } from '../window/traffic-lights'
import { windowControls } from '../window/window-chrome'
import type { InvokeHandlers } from './handle'

type WindowChannels = keyof WindowInvokeContract

const assertTitleBarHeight = (value: unknown): number => {
  const { min, max } = TITLE_BAR_HEIGHT_LIMITS

  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error('Высота шапки - не число в пределах')
  }

  return value
}

/**
 * Каналы рамки окна: кнопки окна - по шапке, которую окно померило. На маке «светофор»
 * встаёт по её середине, на Windows кнопки справа растут до её высоты.
 */
export const createWindowHandlers = (
  getWindow: () => BrowserWindow | null,
): Pick<InvokeHandlers, WindowChannels> => ({
  'window:setTitleBarHeight': ({ height }) => {
    const titleBarHeight = assertTitleBarHeight(height)
    const window = getWindow()

    if (IS_MAC) window?.setWindowButtonPosition(trafficLightPosition(titleBarHeight))
    else window?.setTitleBarOverlay(windowControls(titleBarHeight))
  },
})

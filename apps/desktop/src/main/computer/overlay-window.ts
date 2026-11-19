import { join } from 'node:path'

import { BrowserWindow } from 'electron'

import { IS_MAC } from '../platform'
import { markOverlay } from '../window/overlay-windows'

/** Страницы накладных окон Computer - входы рендерера рядом с index.html. */
export type OverlayPage = 'capsule' | 'pointer'

/**
 * Накладное окно Computer поверх всех приложений (капсула ADR 0057, стрелка ИИ ADR 0079): без
 * рамки и фокуса - иначе оно забирало бы ввод у приложения, в котором работает ИИ, - на всех
 * рабочих столах и поверх полноэкранных приложений, закрыто от захвата экрана. above - на
 * сколько ступеней выше других накладных окон того же слоя: стрелка ложится поверх капсулы.
 */
export const createOverlayWindow = (
  rendererUrl: string | undefined,
  page: OverlayPage,
  size: { width: number; height: number },
  above = 0,
): BrowserWindow => {
  const window = new BrowserWindow({
    ...size,
    // Мак: панель поверх и полноэкранных приложений. Windows: toolbar - без кнопки на панели
    // задач и без места в Alt+Tab.
    type: IS_MAC ? 'panel' : 'toolbar',
    show: false,
    frame: false,
    // Без своих углов системы: окну без рамки macOS и Windows 11 скругляют углы маской (на новых
    // macOS - почти в полкапсулы) и рисуют по краю свою светлую кайму. Маска срезала рамку
    // капсулы на скруглениях, а стрелке ИИ - острие в углу окна. Углы рисует страница.
    roundedCorners: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  markOverlay(window)
  window.setAlwaysOnTop(true, 'screen-saver', above)
  // Без skipTransformProcessType Electron зовёт app.dock.hide(): IDE пропадала из Dock и меню
  // до перезапуска. Поверх полноэкранных приложений панель встаёт и так - это даёт тип panel.
  if (IS_MAC) {
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    })
  }

  // Модель накладное окно не видит: на снимке она не отличила бы его от приложения. На Windows
  // это WDA_EXCLUDEFROMCAPTURE (Windows 10 2004 и новее).
  window.setContentProtection(true)
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (rendererUrl) void window.loadURL(new URL(`${page}.html`, rendererUrl).href)
  else void window.loadFile(join(__dirname, `../renderer/${page}.html`))

  return window
}

/**
 * Снимок без накладного окна там, где система не умеет исключить его из захвата (старый Windows
 * 10, isOverlayInShots): окно прозрачно на время снимка. Где умеет - снимок как есть.
 */
export const withoutOverlay = async <T>(
  window: BrowserWindow | null,
  isInShots: boolean,
  shoot: () => Promise<T>,
): Promise<T> => {
  if (!isInShots || !window?.isVisible()) return shoot()

  window.setOpacity(0)

  try {
    return await shoot()
  } finally {
    if (!window.isDestroyed()) window.setOpacity(1)
  }
}

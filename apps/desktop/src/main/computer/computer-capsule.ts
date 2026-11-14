import { release } from 'node:os'
import { join } from 'node:path'

import { screen, BrowserWindow } from 'electron'

import type { CapsuleView } from '@shared/computer'

import { IS_MAC, IS_WINDOWS } from '../platform'
import { markOverlay } from '../window/overlay-windows'
import { isCapsuleInShots } from './capsule-capture'
import { CAPSULE_WIDTH, CAPSULE_HEIGHT, CAPSULE_BOTTOM_GAP } from './computer.constants'
import type { Point } from './computer.types'

/**
 * Капсула внизу по центру экрана (ADR 0057, 0058), пока ИИ держит компьютер: что он делает,
 * пауза и остановка. Окно поверх всех без фокуса - иначе оно забирало бы ввод у приложения, в
 * котором работает ИИ. Из снимков экрана исключено.
 */
export class ComputerCapsule {
  private window: BrowserWindow | null = null
  private current: CapsuleView | null = null

  private readonly isInShots = isCapsuleInShots(IS_WINDOWS, release())

  constructor(private readonly rendererUrl: string | undefined) {}

  /** Что показывает капсула сейчас - её страница спрашивает при загрузке. */
  view(): CapsuleView | null {
    return this.current
  }

  show(view: CapsuleView | null): void {
    this.current = view

    if (!view) {
      this.window?.hide()

      return
    }

    const window = this.window ?? this.create()

    this.place(window)
    window.webContents.send('computer:capsuleChanged', view)

    if (!window.isVisible()) window.showInactive()
  }

  /**
   * Снимок без капсулы там, где система не умеет исключить её из захвата (старый Windows 10):
   * капсула прозрачна на время снимка. Где умеет - снимок как есть.
   */
  async hiddenFromShot<T>(shoot: () => Promise<T>): Promise<T> {
    const window = this.window

    if (!this.isInShots || !window?.isVisible()) return shoot()

    window.setOpacity(0)

    try {
      return await shoot()
    } finally {
      if (!window.isDestroyed()) window.setOpacity(1)
    }
  }

  /** Рука бьёт в точку под капсулой: её клики проходят сквозь капсулу к приложению под ней. */
  passThrough(isOn: boolean): void {
    this.window?.setIgnoreMouseEvents(isOn)
  }

  /** Лежит ли точка экрана (точки Electron, как у руки) под видимой капсулой. */
  covers(point: Point): boolean {
    if (!this.window?.isVisible()) return false

    const { x, y, width, height } = this.window.getBounds()

    return point.x >= x && point.x < x + width && point.y >= y && point.y < y + height
  }

  destroy(): void {
    this.window?.destroy()
    this.window = null
  }

  private create(): BrowserWindow {
    const window = new BrowserWindow({
      width: CAPSULE_WIDTH,
      height: CAPSULE_HEIGHT,
      // Мак: панель поверх и полноэкранных приложений. Windows: toolbar - без кнопки на панели
      // задач и без места в Alt+Tab.
      type: IS_MAC ? 'panel' : 'toolbar',
      show: false,
      frame: false,
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
    window.setAlwaysOnTop(true, 'screen-saver')
    if (IS_MAC) window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    // Модель капсулу не видит: на снимке она не отличила бы её от кнопок приложения. На Windows
    // это WDA_EXCLUDEFROMCAPTURE (Windows 10 2004 и новее).
    window.setContentProtection(true)
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.on('closed', () => {
      this.window = null
    })

    if (this.rendererUrl) void window.loadURL(new URL('capsule.html', this.rendererUrl).href)
    else void window.loadFile(join(__dirname, '../renderer/capsule.html'))

    this.window = window

    return window
  }

  /** Внизу по центру дисплея, где сейчас мышь: там же работает и ИИ. */
  private place(window: BrowserWindow): void {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())

    window.setBounds({
      x: Math.round(workArea.x + (workArea.width - CAPSULE_WIDTH) / 2),
      y: Math.round(workArea.y + workArea.height - CAPSULE_HEIGHT - CAPSULE_BOTTOM_GAP),
      width: CAPSULE_WIDTH,
      height: CAPSULE_HEIGHT,
    })
  }
}

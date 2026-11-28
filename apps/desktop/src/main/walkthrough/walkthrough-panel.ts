import { release } from 'node:os'

import { screen } from 'electron'
import type { BrowserWindow } from 'electron'

import type { WalkthroughPanelView } from '@shared/walkthrough'

import { IS_WINDOWS } from '../platform'
import { isOverlayInShots } from '../computer/capsule-capture'
import type { Display } from '../computer/computer-geometry'
import { withoutOverlay, createOverlayWindow } from '../computer/overlay-window'

/**
 * Размер панели - ровно её окно, без прозрачных полей: поле ловило бы клики, предназначенные
 * приложению под ним. Три инструмента и «стереть» столбиком, у каждого подпись.
 */
export const PANEL_WIDTH = 68
export const PANEL_HEIGHT = 236

/** Отступ панели от правого края рабочей области дисплея. */
const PANEL_GAP = 12

const NONE: WalkthroughPanelView = { pen: null, hasStrokes: false }

/**
 * Панель инструментов человека в показе Walkthrough (ADR 0135): у правого края экрана, пока идёт
 * показ. Человек берёт обводку, подчёркивание или стрелку, рисует поверх и говорит, о чём это.
 * Накладное окно без фокуса (как капсула): клики доходят, клавиатуру у приложения оно не забирает;
 * из снимков исключено - модель панели не видит.
 */
export class WalkthroughPanel {
  private window: BrowserWindow | null = null
  private view: WalkthroughPanelView = NONE

  private readonly isInShots = isOverlayInShots(IS_WINDOWS, release())

  constructor(private readonly rendererUrl: string | undefined) {}

  /** Что показывает панель сейчас - её странице, когда она открылась. */
  current(): WalkthroughPanelView {
    return this.view
  }

  show(display: Display, view: WalkthroughPanelView): void {
    const window = this.window ?? this.create()

    this.view = view
    this.place(window, display)
    window.webContents.send('walkthrough:panelChanged', view)

    if (!window.isVisible()) window.showInactive()
  }

  hide(): void {
    this.view = NONE
    this.window?.hide()
  }

  /** Снимок без панели там, где система не исключает окно из захвата (старый Windows 10). */
  hiddenFromShot<T>(shoot: () => Promise<T>): Promise<T> {
    return withoutOverlay(this.window, this.isInShots, shoot)
  }

  destroy(): void {
    this.window?.destroy()
    this.window = null
  }

  private create(): BrowserWindow {
    const window = createOverlayWindow(this.rendererUrl, 'walkthrough-panel', {
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
    })

    window.on('closed', () => {
      this.window = null
    })
    this.window = window

    return window
  }

  /** У правого края рабочей области дисплея показа, посередине по высоте. */
  private place(window: BrowserWindow, display: Display): void {
    const area =
      screen.getAllDisplays().find((one) => one.id === display.id)?.workArea ?? display.bounds

    window.setBounds({
      x: Math.round(area.x + area.width - PANEL_WIDTH - PANEL_GAP),
      y: Math.round(area.y + (area.height - PANEL_HEIGHT) / 2),
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
    })
  }
}

import { release } from 'node:os'

import type { BrowserWindow } from 'electron'

import { IS_WINDOWS } from '../platform'
import { isOverlayInShots } from './capsule-capture'
import type { PointerMark } from './computer-pointer'
import { POINTER_WINDOW_SIZE } from './computer.constants'
import type { Point } from './computer.types'
import { withoutOverlay, createOverlayWindow } from './overlay-window'

const HALF = POINTER_WINDOW_SIZE / 2

/**
 * Окно стрелки ИИ Computer Use (ADR 0079): маленький прозрачный квадрат, острие стрелки - в его
 * середине. Окно едет за рукой само (setPosition на каждом её шаге), страница не перерисовывается -
 * ей приходят только нажатия. Клики проходят сквозь него, из снимков экрана оно исключено.
 */
export class ComputerPointerWindow implements PointerMark {
  private window: BrowserWindow | null = null
  private presses = 0

  private readonly isInShots = isOverlayInShots(IS_WINDOWS, release())

  constructor(private readonly rendererUrl: string | undefined) {}

  show(at: Point): void {
    const window = this.window ?? this.create()

    this.place(window, at)

    if (!window.isVisible()) window.showInactive()
  }

  moveTo(at: Point): void {
    if (this.window) this.place(this.window, at)
  }

  press(): void {
    this.presses += 1
    this.window?.webContents.send('computer:pointerPressed', this.presses)
  }

  hide(): void {
    this.window?.hide()
  }

  /** Снимок без стрелки там, где система не исключает её из захвата (старый Windows 10). */
  hiddenFromShot<T>(shoot: () => Promise<T>): Promise<T> {
    return withoutOverlay(this.window, this.isInShots, shoot)
  }

  destroy(): void {
    this.window?.destroy()
    this.window = null
  }

  private create(): BrowserWindow {
    const size = { width: POINTER_WINDOW_SIZE, height: POINTER_WINDOW_SIZE }
    // Выше капсулы: рука ведёт стрелку и над ней.
    const window = createOverlayWindow(this.rendererUrl, 'pointer', size, 1)

    // Нажатия руки бьют ровно под острие - в приложение под окном, а не в окно.
    window.setIgnoreMouseEvents(true)
    window.on('closed', () => {
      this.window = null
    })
    this.window = window

    return window
  }

  private place(window: BrowserWindow, at: Point): void {
    window.setPosition(Math.round(at.x - HALF), Math.round(at.y - HALF))
  }
}

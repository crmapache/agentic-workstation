import { release } from 'node:os'

import type { BrowserWindow } from 'electron'

import type { MarkPoint, WalkthroughMark, WalkthroughMarksView } from '@shared/walkthrough'

import { IS_WINDOWS } from '../platform'
import { isOverlayInShots } from '../computer/capsule-capture'
import type { Rect } from '../computer/computer-geometry'
import { withoutOverlay, createOverlayWindow } from '../computer/overlay-window'

const EMPTY: WalkthroughMarksView = { width: 0, height: 0, marks: [] }

/**
 * Окно меток показа Walkthrough (ADR 0134): прозрачное, во весь дисплей, поверх приложений, но
 * под капсулой и стрелкой Computer Use. Мышь проходит сквозь него, из снимков экрана оно
 * исключено - модель меток не видит и не примет их за часть приложения. Меток нет - окна не видно.
 */
export class WalkthroughWindow {
  private window: BrowserWindow | null = null
  private view: WalkthroughMarksView = EMPTY

  private readonly isInShots = isOverlayInShots(IS_WINDOWS, release())

  constructor(private readonly rendererUrl: string | undefined) {}

  /** Что окно рисует сейчас: странице, которая только открылась. */
  current(): WalkthroughMarksView {
    return this.view
  }

  /**
   * Встать на дисплей (area - его границы в точках экрана) и нарисовать метки; mark получает
   * левый верхний угол окна. Его берём у самого окна: система может не пустить окно на строку меню
   * мака, и тогда точки окна сдвинуты.
   */
  show(area: Rect, mark: (origin: MarkPoint) => WalkthroughMark[]): void {
    const window = this.window ?? this.create()

    window.setBounds({
      x: Math.round(area.x),
      y: Math.round(area.y),
      width: Math.round(area.width),
      height: Math.round(area.height),
    })

    const bounds = window.getBounds()

    this.send({ width: bounds.width, height: bounds.height, marks: mark(bounds) })

    if (!window.isVisible()) window.showInactive()
  }

  hide(): void {
    if (this.view.marks.length === 0) return

    this.send(EMPTY)
    this.window?.hide()
  }

  /** Снимок без меток там, где система не исключает окно из захвата (старый Windows 10). */
  hiddenFromShot<T>(shoot: () => Promise<T>): Promise<T> {
    return withoutOverlay(this.window, this.isInShots, shoot)
  }

  destroy(): void {
    this.window?.destroy()
    this.window = null
    this.view = EMPTY
  }

  private send(view: WalkthroughMarksView): void {
    this.view = view
    this.window?.webContents.send('walkthrough:marks', view)
  }

  private create(): BrowserWindow {
    // Ступенью ниже капсулы и стрелки ИИ: затемнение не гасит Pause и Stop.
    const window = createOverlayWindow(this.rendererUrl, 'walkthrough', { width: 1, height: 1 }, -1)

    window.setIgnoreMouseEvents(true)
    window.on('closed', () => {
      this.window = null
    })
    this.window = window

    return window
  }
}

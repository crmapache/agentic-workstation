import { release } from 'node:os'

import type { BrowserWindow } from 'electron'

import type { MarkPoint, WalkthroughPen, WalkthroughMarksView } from '@shared/walkthrough'

import { IS_WINDOWS } from '../platform'
import { isOverlayInShots } from '../computer/capsule-capture'
import type { Rect } from '../computer/computer-geometry'
import { withoutOverlay, createOverlayWindow } from '../computer/overlay-window'
import type { StageDrawing } from './walkthrough-stage'

const EMPTY: WalkthroughMarksView = { width: 0, height: 0, lit: [], strokes: [], pen: null }

/**
 * Сколько окно ещё видно после того, как меток не стало: затемнение уходит плавно, а не
 * пропадает. Чуть дольше перехода в странице (--duration-slow).
 */
const FADE_OUT_MS = 320

/**
 * Окно меток показа Walkthrough (ADR 0134, 0135): прозрачное, во весь дисплей, поверх приложений,
 * но под капсулой, стрелкой Computer Use и панелью инструментов. Обычно мышь проходит сквозь него;
 * с инструментом в руке человека окно ловит её - он рисует пометку. Из снимков экрана оно
 * исключено: модель меток не видит и не примет их за часть приложения. Меток нет - окна не видно.
 */
export class WalkthroughWindow {
  private window: BrowserWindow | null = null
  private view: WalkthroughMarksView = EMPTY
  private hideTimer: ReturnType<typeof setTimeout> | null = null

  private readonly isInShots = isOverlayInShots(IS_WINDOWS, release())

  constructor(private readonly rendererUrl: string | undefined) {}

  /** Что окно рисует сейчас: странице, которая только открылась. */
  current(): WalkthroughMarksView {
    return this.view
  }

  /**
   * Встать на дисплей (area - его границы в точках экрана) и нарисовать метки; draw получает
   * левый верхний угол окна. Его берём у самого окна: система может не пустить окно на строку меню
   * мака, и тогда точки окна сдвинуты. pen - инструмент в руке человека: окно ловит мышь.
   */
  show(area: Rect, draw: (origin: MarkPoint) => StageDrawing, pen: WalkthroughPen | null): void {
    const window = this.window ?? this.create()

    this.cancelHide()
    window.setBounds({
      x: Math.round(area.x),
      y: Math.round(area.y),
      width: Math.round(area.width),
      height: Math.round(area.height),
    })
    window.setIgnoreMouseEvents(pen === null)

    const bounds = window.getBounds()

    this.send({ width: bounds.width, height: bounds.height, ...draw(bounds), pen })

    if (!window.isVisible()) window.showInactive()
  }

  hide(): void {
    if (this.view.lit.length === 0 && this.view.strokes.length === 0 && !this.view.pen) return

    this.send({ ...EMPTY, width: this.view.width, height: this.view.height })
    this.window?.setIgnoreMouseEvents(true)
    this.cancelHide()
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null
      this.window?.hide()
    }, FADE_OUT_MS)
  }

  /** Точки окна - в точки экрана: пометку человек рисует в окне, а хранится она на экране. */
  toScreen(points: readonly MarkPoint[]): MarkPoint[] | null {
    if (!this.window?.isVisible()) return null

    const { x, y } = this.window.getBounds()

    return points.map((point) => ({ x: point.x + x, y: point.y + y }))
  }

  /** Снимок без меток там, где система не исключает окно из захвата (старый Windows 10). */
  hiddenFromShot<T>(shoot: () => Promise<T>): Promise<T> {
    return withoutOverlay(this.window, this.isInShots, shoot)
  }

  destroy(): void {
    this.cancelHide()
    this.window?.destroy()
    this.window = null
    this.view = EMPTY
  }

  private cancelHide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)

    this.hideTimer = null
  }

  private send(view: WalkthroughMarksView): void {
    this.view = view
    this.window?.webContents.send('walkthrough:marks', view)
  }

  private create(): BrowserWindow {
    // Ступенью ниже капсулы, стрелки ИИ и панели: затемнение не гасит Pause, Stop и инструменты.
    const window = createOverlayWindow(this.rendererUrl, 'walkthrough', { width: 1, height: 1 }, -1)

    window.setIgnoreMouseEvents(true)
    window.on('closed', () => {
      this.window = null
    })
    this.window = window

    return window
  }
}

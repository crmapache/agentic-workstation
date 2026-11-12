import type { CursorAction } from '@agentic-workstation/browser-protocol/protocol'

import type { Point, MoveStep } from './human-motion'
import { humanPath, wheelTicks } from './human-motion'
import type { Page } from './page'

/**
 * Мышь агента во вкладке (ADR 0044): где она сейчас, путь до цели живыми событиями движения и
 * курсор на экране тем же путём. Сайт видит руку, а не телепорт: события идут по всему пути с
 * разгоном и торможением, точка нажатия - не геометрический центр.
 */

export type MouseButton = 'left' | 'right' | 'middle'

const BUTTON_MASK: Record<MouseButton, number> = { left: 1, right: 2, middle: 4 }

/** Сколько точек пути получает курсор на экране: больше не нужно для плавности. */
const OVERLAY_POINTS = 48

export const mouse = (
  page: Page,
  type: 'mouseMoved' | 'mousePressed' | 'mouseReleased',
  { x, y }: Point,
  button: MouseButton | 'none',
  clickCount: number,
) =>
  page.cdp(
    'Input.dispatchMouseEvent',
    {
      type,
      x,
      y,
      button,
      clickCount,
      buttons: type === 'mousePressed' && button !== 'none' ? BUTTON_MASK[button] : 0,
    },
    // Отпускание уходит и после Stop: нажатая навсегда кнопка тянула бы выделение.
    { unstoppable: type === 'mouseReleased' },
  )

/** Размер видимой части страницы в CSS-пикселях. */
export const viewportOf = async (page: Page): Promise<{ width: number; height: number }> => {
  const metrics = await page.cdp<{
    cssLayoutViewport?: { clientWidth: number; clientHeight: number }
  }>('Page.getLayoutMetrics')
  const viewport = metrics.cssLayoutViewport ?? { clientWidth: 800, clientHeight: 600 }

  return { width: viewport.clientWidth, height: viewport.clientHeight }
}

/**
 * Где мышь сейчас. Во вкладке ещё не двигали - где-то в нижней середине окна, как у
 * человека, который только что пришёл на страницу, а не в точке ноль.
 */
const startOf = (page: Page, { width, height }: { width: number; height: number }): Point => {
  if (page.tab.pointer) return page.tab.pointer

  const { random } = page.motion

  return {
    x: Math.round(width * (0.35 + 0.3 * random())),
    y: Math.round(height * (0.55 + 0.3 * random())),
  }
}

/** Путь курсору на экране: начало, прореженные шаги и конец - [x, y, мс от начала]. */
const overlayPath = (from: Point, steps: readonly MoveStep[]): [number, number, number][] => {
  const every = Math.max(1, Math.ceil(steps.length / OVERLAY_POINTS))
  const picked = steps.filter((_, index) => index % every === 0 || index === steps.length - 1)

  return [
    [from.x, from.y, 0],
    ...picked.map((step): [number, number, number] => [step.x, step.y, step.at]),
  ]
}

/**
 * Довести мышь до точки: события движения по всему пути вовремя и курсор на экране тем же
 * путём - параллельно, конец - когда дошли оба. Курсор - украшение: страница без него не ждёт.
 */
export const moveTo = async (page: Page, to: Point, action: CursorAction): Promise<void> => {
  const at = page.tab.pointer

  // Мышь уже здесь: настоящая мышь без движения событий не шлёт, а курсору ехать некуда.
  if (action === 'move' && at && Math.hypot(at.x - to.x, at.y - to.y) < 1) return

  const view = await viewportOf(page)
  const { width, height } = view
  const from = startOf(page, view)
  // Дуга и проскок у края окна не уходят за него: мышь за краем - mouseleave, и сайт закрыл
  // бы меню под наведением или показал окно «вы уходите?».
  const steps = humanPath(from, to, page.motion.random).map((step) => ({
    ...step,
    x: Math.min(Math.max(step.x, 0), Math.max(0, width - 1)),
    y: Math.min(Math.max(step.y, 0), Math.max(0, height - 1)),
  }))
  const duration = steps.at(-1)?.at ?? 0
  const cursor = page.cursor(to.x, to.y, action, { path: overlayPath(from, steps), duration })
  const { now, sleep } = page.motion
  const started = now()

  for (const [index, step] of steps.entries()) {
    const next = steps[index + 1]

    // События опаздывают (машина занята, связь медленная): шаги, чьё время уже прошло,
    // пропускаются - путь тот же, а рука не замедляется. Последний шаг - всегда.
    if (next && next.at <= now() - started) continue

    await sleep(step.at - (now() - started), page.signal)
    await mouse(page, 'mouseMoved', step, 'none', 0)
    page.tab.pointer = { x: step.x, y: step.y }
  }

  await cursor
}

/**
 * Колесо в точке: серия убывающих толчков кадр за кадром, как трекпад, а не один прыжок на всю
 * высоту. Мышь уже должна быть в точке (moveTo).
 */
export const wheel = async (page: Page, at: Point, dx: number, dy: number): Promise<void> => {
  const { now, sleep } = page.motion
  const started = now()

  // Толчок за толчком, даже опоздавшие: Chrome применяет колесо отладчика сразу, без своей
  // анимации, и плавность прокрутки - это число толчков. Склеенные, они дали бы рывок.
  for (const tick of wheelTicks(dx, dy)) {
    await sleep(tick.at - (now() - started), page.signal)
    await page.cdp('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: at.x,
      y: at.y,
      deltaX: tick.dx,
      deltaY: tick.dy,
    })
  }
}

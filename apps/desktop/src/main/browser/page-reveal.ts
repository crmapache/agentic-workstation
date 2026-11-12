import { BrowserError } from './browser-error'
import { MAIN_FRAME } from './frame-refs'
import type { ElementRef } from './frame-refs'
import { settleMs, aimInside } from './human-motion'
import type { Point } from './human-motion'
import type { Page } from './page'
import { boxOf, callOnElement, revealElement } from './page-nodes'
import type { Target } from './page-nodes'
import { wheel, moveTo } from './page-pointer'

/**
 * Прокрутка к элементу рукой (ADR 0051): мышь встаёт над тем, что надо прокрутить (обычно -
 * где она уже стоит), и крутит колесо, страница едет плавно, а не прыгает. План заход за заходом
 * считает сама страница: какой из прокручиваемых предков элемента сдвинуть (внешний первым), на
 * сколько и где колесо возьмёт именно его, а не вложенный список под мышью. Колесо крутит
 * только главный документ: элемент во фрейме доезжает так до своего iframe, а внутри фрейма -
 * программной прокруткой, как раньше. Не вышло (план не нашёл точку, страница не сдвинулась) -
 * прежний прыжок: клик важнее красоты.
 */

/** Больше заходов колесом не делаем: дальше страница длиннее разумного - прыжок. */
const MAX_ROUNDS = 8

/** За один заход - не больше стольких высот видимой части: длинный путь - несколькими махами. */
const SCREENS_PER_ROUND = 8

/** Заход: куда встать мыши и сколько крутить; at - где был элемент до него. */
type Plan =
  { done: true } | { done: false; point: Point | null; dx: number; dy: number; at: number[] }

/**
 * План одного захода - функция страницы на элементе (this). Аргументы: где мышь (или null) и
 * предел захода в высотах. Элемент «на виду» у прокручиваемого блока: мелкий - целиком с
 * полем 8 px, крупнее блока - серединой (рука жмёт рядом с ней).
 */
const PLAN = `function (pointer, screens) {
  const doc = this.ownerDocument
  const win = doc.defaultView
  const root = doc.scrollingElement || doc.documentElement
  const MARGIN = 8
  const style = (el) => win.getComputedStyle(el)
  const overflowOf = (el, axis) => axis === 'y' ? style(el).overflowY : style(el).overflowX
  // Прокрутку окна запрещает overflow у html, а если у него visible - у body (так делают модальные окна).
  const viewportOverflow = (axis) => {
    const own = overflowOf(doc.documentElement, axis)
    return own === 'visible' && doc.body ? overflowOf(doc.body, axis) : own
  }
  const scrolls = (el, axis) => {
    if (el === root) return !/hidden|clip/.test(viewportOverflow(axis)) && (axis === 'y' ? root.scrollHeight > root.clientHeight : root.scrollWidth > root.clientWidth)
    const overflow = overflowOf(el, axis)
    return /(auto|scroll|overlay)/.test(overflow) && (axis === 'y' ? el.scrollHeight > el.clientHeight : el.scrollWidth > el.clientWidth)
  }
  const rect = this.getBoundingClientRect()
  if (!rect.width && !rect.height) return { done: true }
  // Прокручиваемые предки от внешнего к внутреннему; выше фиксированного предка документ элемент не двигает.
  const chain = []
  let fixed = style(this).position === 'fixed'
  for (let el = this.parentElement; el && !fixed; el = el.parentElement) {
    if (el === root) continue
    if (scrolls(el, 'y') || scrolls(el, 'x')) chain.unshift(el)
    fixed = style(el).position === 'fixed'
  }
  if (!fixed && (scrolls(root, 'y') || scrolls(root, 'x'))) chain.unshift(root)
  const view = { left: 0, top: 0, right: root.clientWidth, bottom: root.clientHeight }
  const boxOf = (el) => {
    if (el === root) return view
    const r = el.getBoundingClientRect()
    const left = r.left + el.clientLeft
    const top = r.top + el.clientTop
    return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight }
  }
  const clip = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) })
  const seen = (from, to, low, high) => to - from <= high - low - 2 * MARGIN
    ? from >= low + MARGIN && to <= high - MARGIN
    : (from + to) / 2 >= low + MARGIN && (from + to) / 2 <= high - MARGIN
  const room = (el, axis, sign) => {
    if (!scrolls(el, axis)) return false
    const at = axis === 'y' ? el.scrollTop : el.scrollLeft
    const max = axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
    return sign > 0 ? at < max - 0.5 : at > 0.5
  }
  // Колесо в точке берёт первый блок под мышью, которому есть куда ехать; блок с overscroll-behavior дальше его не отдаёт.
  const takes = (scroller, x, y, axis, sign) => {
    const hit = doc.elementFromPoint(x, y)
    if (!hit || /^(IFRAME|FRAME|EMBED|OBJECT)$/.test(hit.tagName)) return false
    for (let el = hit; el; el = el.parentElement) {
      if (el === scroller) return true
      if (el === root) return false
      if (room(el, axis, sign)) return false
      const chained = axis === 'y' ? style(el).overscrollBehaviorY : style(el).overscrollBehaviorX
      if (scrolls(el, axis) && chained !== 'auto') return false
    }
    return false
  }
  // Где мышь не попадёт под то, что едет: страница везёт к середине вложенный блок, и, проехав
  // под стоящей мышью, он забрал бы себе последние толчки колеса. Вниз - точка выше места, где
  // он встанет, вверх - ниже; такой нет - любая, следующий заход доведёт.
  const clear = (p, target, dx, dy) => Math.abs(dy) >= Math.abs(dx)
    ? (dy > 0 ? p.y < target.top - dy - MARGIN : p.y > target.bottom - dy + MARGIN)
    : (dx > 0 ? p.x < target.left - dx - MARGIN : p.x > target.right - dx + MARGIN)
  const pointFor = (scroller, box, dx, dy, target) => {
    const axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x'
    const sign = Math.sign(axis === 'y' ? dy : dx)
    const inside = (p) => p.x >= box.left + 2 && p.x <= box.right - 2 && p.y >= box.top + 2 && p.y <= box.bottom - 2
    const near = pointer || { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
    const shares = [0.5, 0.3, 0.7, 0.15, 0.85]
    const candidates = shares.flatMap((fy) => shares.map((fx) => ({
      x: box.left + (box.right - box.left) * fx,
      y: box.top + (box.bottom - box.top) * fy,
    })))
    if (pointer) candidates.unshift(pointer)
    const cost = (p) => (clear(p, target, dx, dy) ? 0 : 1e6) + Math.hypot(p.x - near.x, p.y - near.y)
    const fits = candidates
      .filter((p) => inside(p) && takes(scroller, p.x, p.y, axis, sign))
      .sort((a, b) => cost(a) - cost(b))
    return fits[0] ? { x: Math.round(fits[0].x), y: Math.round(fits[0].y) } : null
  }
  // Что показать блоку: сам элемент или, пока его прячет вложенный блок, этот вложенный блок -
  // человек сначала крутит страницу до списка, потом сам список.
  const shown = (r, box) => seen(r.top, r.bottom, box.top, box.bottom) && seen(r.left, r.right, box.left, box.right)
  const targetFor = (index) => {
    for (const inner of chain.slice(index + 1)) {
      if (!shown(rect, boxOf(inner))) return boxOf(inner)
    }
    return rect
  }
  let area = view
  for (const [index, scroller] of chain.entries()) {
    const box = clip(boxOf(scroller), area)
    area = box
    const target = targetFor(index)
    const okY = seen(target.top, target.bottom, box.top, box.bottom)
    const okX = seen(target.left, target.right, box.left, box.right)
    if (okX && okY) continue
    const limit = (want, at, max, size) => Math.max(-at, Math.min(max - at, Math.max(-size * screens, Math.min(size * screens, want))))
    const dy = okY ? 0 : Math.round(limit((target.top + target.bottom) / 2 - (box.top + box.bottom) / 2, scroller.scrollTop, scroller.scrollHeight - scroller.clientHeight, box.bottom - box.top))
    const dx = okX ? 0 : Math.round(limit((target.left + target.right) / 2 - (box.left + box.right) / 2, scroller.scrollLeft, scroller.scrollWidth - scroller.clientWidth, box.right - box.left))
    if (!dx && !dy) continue
    return { done: false, dx, dy, point: pointFor(scroller, box, dx, dy, target), at: [rect.left, rect.top] }
  }
  const visible = seen(rect.top, rect.bottom, area.top, area.bottom) && seen(rect.left, rect.right, area.left, area.right)
  return visible ? { done: true } : { done: false, dx: 0, dy: 0, point: null, at: [rect.left, rect.top] }
}`

/**
 * Дождаться, пока страница встанет: прокрутку от колеса применяет поток отрисовки Chrome, и до
 * документа она доходит не обязательно к ответу на последний толчок, а страница может доехать
 * сама (плавная прокрутка сайта). Ответ - где элемент теперь; стоит на месте три замера подряд
 * (через 30 мс) или прошло 1.5 с.
 */
const SETTLED = `function () {
  return new Promise((resolve) => {
    let last = null
    let still = 0
    let waited = 0
    const tick = () => {
      const r = this.getBoundingClientRect()
      const now = [r.left, r.top]
      still = last && Math.abs(now[0] - last[0]) < 0.5 && Math.abs(now[1] - last[1]) < 0.5 ? still + 1 : 0
      last = now
      if (still >= 2 || waited >= 1500) return resolve(now)
      waited += 30
      setTimeout(tick, 30)
    }
    setTimeout(tick, 30)
  })
}`

/** Колесо крутит главный документ: у элемента фрейма - до iframe, с которого фрейм начинается. */
const wheelTargetOf = (element: ElementRef): ElementRef => {
  let at = element.frame

  while (at.parent?.parent) at = at.parent

  return at.parent && at.owner !== null ? { node: at.owner, frame: MAIN_FRAME } : element
}

const isPlan = (value: unknown): value is Plan =>
  typeof value === 'object' && value !== null && typeof (value as Plan).done === 'boolean'

/**
 * Заходы колесом, пока элемент не на виду. Ответ - дошли ли; нет - прыжок за нас сделает
 * прежняя прокрутка. Отказ страницы в плане - тоже «не дошли»: исчезнувший элемент заметит
 * следующий шаг, как и раньше; отмену вызова пропускаем дальше.
 */
const wheelInto = async (page: Page, element: ElementRef, ref: string): Promise<boolean> => {
  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const plan = await callOnElement<unknown>(page, element, ref, PLAN, [
        page.tab.pointer,
        SCREENS_PER_ROUND,
      ])

      if (!isPlan(plan) || plan.done) return isPlan(plan)
      if (!plan.point) return false

      if (round > 0) await page.motion.sleep(settleMs(page.motion.random), page.signal)

      await moveTo(page, plan.point, 'move')
      await wheel(page, plan.point, plan.dx, plan.dy)

      const after = await callOnElement<number[]>(page, element, ref, SETTLED)

      if (
        Math.abs((after[0] ?? 0) - (plan.at[0] ?? 0)) < 1 &&
        Math.abs((after[1] ?? 0) - (plan.at[1] ?? 0)) < 1
      ) {
        return false
      }
    }

    return false
  } catch (error) {
    if (error instanceof BrowserError && error.code === 'aborted') throw error

    return false
  }
}

/**
 * Элемент - на виду, как это сделал бы человек: колесом главного документа, внутри фрейма -
 * программно. Колесо не довело - прежний прыжок (scrollIntoViewIfNeeded); элемент пропал -
 * «возьми новый снимок».
 */
export const revealByHand = async (page: Page, ref: string): Promise<void> => {
  const element = page.elementOf(ref)
  const reached = await wheelInto(page, wheelTargetOf(element), ref)

  if (reached && element.frame.parent === null) return

  await revealElement(page, ref).catch((error: unknown) => {
    if (error instanceof BrowserError && ['bad-request', 'aborted'].includes(error.code)) {
      throw error
    }
  })
}

/** Куда нажать: точка модели - как есть, элемент - на виду и рядом с серединой, как человек. */
export const aimOf = async (page: Page, target: Target): Promise<Point> => {
  if (!('ref' in target)) return target

  await revealByHand(page, target.ref)

  return aimInside(await boxOf(page, target.ref), page.motion.random)
}

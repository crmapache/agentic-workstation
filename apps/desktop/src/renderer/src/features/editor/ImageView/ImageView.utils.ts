import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEPS,
  ZOOM_EPSILON,
  WHEEL_ZOOM_SPEED,
  WHEEL_DELTA_LIMIT,
} from './ImageView.constants'
import type { Size, ZoomAnchor, ScreenPoint } from './ImageView.types'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Масштаб в пределах: не меньше 5% и не больше 3200%. */
export const clampScale = (scale: number): number => clamp(scale, ZOOM_MIN, ZOOM_MAX)

/**
 * Масштаб «вписать»: большая картинка уменьшается до места, маленькая остаётся своего размера
 * - растянутая иконка врала бы о том, какая она. Места или картинки ещё нет - свой размер.
 */
export const fitScale = (image: Size, room: Size): number =>
  image.width > 0 && image.height > 0 && room.width > 0 && room.height > 0
    ? Math.min(1, room.width / image.width, room.height / image.height)
    : 1

/** Следующая ступень масштаба крупнее (direction 1) или мельче (-1), чем сейчас. */
export const zoomStep = (scale: number, direction: 1 | -1): number =>
  direction > 0
    ? (ZOOM_STEPS.find((step) => step > scale + ZOOM_EPSILON) ?? ZOOM_MAX)
    : (ZOOM_STEPS.findLast((step) => step < scale - ZOOM_EPSILON) ?? ZOOM_MIN)

/** Масштаб после щипка или колеса с ⌘: вверх (deltaY < 0) - крупнее, плавно. */
export const wheelScale = (scale: number, deltaY: number): number =>
  clampScale(
    scale * Math.exp(-clamp(deltaY, -WHEEL_DELTA_LIMIT, WHEEL_DELTA_LIMIT) * WHEEL_ZOOM_SPEED),
  )

/** Масштаб словами: 0.5 - «50%». */
export const zoomPercent = (scale: number): string => `${Math.round(scale * 100)}%`

/** Размер файла: байты, КБ или МБ, дробь - только у малых чисел, как в Finder. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`

  const [value, unit] = bytes < 1024 * 1024 ? [bytes / 1024, 'KB'] : [bytes / 1024 / 1024, 'MB']

  return `${value < 10 ? Number(value.toFixed(1)) : Math.round(value)} ${unit}`
}

/**
 * Что держать на месте при смене масштаба: точку экрана (курсор, без него - середину места) и
 * долю картинки под ней. Картинка ещё не нарисована - держать нечего.
 */
export const anchorOf = (
  image: Element | null,
  scroll: Element | null,
  at: ScreenPoint | undefined,
): ZoomAnchor | null => {
  if (!image || !scroll) return null

  const box = image.getBoundingClientRect()
  const view = scroll.getBoundingClientRect()
  const x = at?.clientX ?? view.left + view.width / 2
  const y = at?.clientY ?? view.top + view.height / 2

  if (box.width <= 0 || box.height <= 0) return null

  return { x, y, partX: (x - box.left) / box.width, partY: (y - box.top) / box.height }
}

/** Место внутри элемента без его полей: как contentRect у ResizeObserver, но сразу. */
export const contentSize = (element: HTMLElement): Size => {
  const style = getComputedStyle(element)

  return {
    width: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    height: element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
  }
}

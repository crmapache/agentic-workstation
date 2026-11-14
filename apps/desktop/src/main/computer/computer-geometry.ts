import { SHOT_MAX_SIDE, SHOT_MAX_PIXELS } from './computer.constants'
import type { Point } from './computer.types'

/** Прямоугольник в точках экрана macOS. */
export type Rect = { x: number; y: number; width: number; height: number }

/** Дисплей: id - как у screen Electron и у источника desktopCapturer. */
export type Display = { id: number; bounds: Rect; scaleFactor: number; isMain: boolean }

/**
 * Последний снимок, который видела модель: с какого дисплея и какого размера в пикселях.
 * Координаты её действий - пиксели этого снимка; рука переводит их в точки экрана.
 */
export type ShotFrame = { display: Display; width: number; height: number }

/** Размер снимка дисплея для модели: по пропорциям дисплея, в пределах SHOT_MAX_*. */
export const shotSize = (bounds: Rect): { width: number; height: number } => {
  const scale = Math.min(
    1,
    SHOT_MAX_SIDE / Math.max(bounds.width, bounds.height),
    Math.sqrt(SHOT_MAX_PIXELS / (bounds.width * bounds.height)),
  )

  return {
    width: Math.max(1, Math.floor(bounds.width * scale)),
    height: Math.max(1, Math.floor(bounds.height * scale)),
  }
}

/**
 * Пиксель снимка - точка экрана. Мимо снимка не бывает: модель ошиблась на край - точка
 * прижимается к краю дисплея, а не уходит на соседний.
 */
export const toScreen = (frame: ShotFrame, x: number, y: number): Point => {
  const { bounds } = frame.display
  const clamp = (value: number, size: number) => Math.min(Math.max(value, 0), size - 1)

  return {
    x: bounds.x + clamp((x * bounds.width) / frame.width, bounds.width),
    y: bounds.y + clamp((y * bounds.height) / frame.height, bounds.height),
  }
}

/** Точка экрана - пиксель снимка; точка на другом дисплее - null. */
export const toShot = (frame: ShotFrame, point: Point): Point | null => {
  const { bounds } = frame.display
  const x = point.x - bounds.x
  const y = point.y - bounds.y

  if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) return null

  return {
    x: Math.round((x * frame.width) / bounds.width),
    y: Math.round((y * frame.height) / bounds.height),
  }
}

/** Дисплей, на котором точка; мимо всех - главный. */
export const displayAt = (displays: readonly Display[], point: Point): Display | undefined =>
  displays.find(
    ({ bounds }) =>
      point.x >= bounds.x &&
      point.y >= bounds.y &&
      point.x < bounds.x + bounds.width &&
      point.y < bounds.y + bounds.height,
  ) ?? displays.find((display) => display.isMain)

/**
 * Область снимка (x0, y0 - x1, y1 в его пикселях) - прямоугольник в точках экрана для
 * подробного снимка. Перевёрнутые углы выправляются, область за краем обрезается.
 */
export const regionOf = (frame: ShotFrame, corners: [number, number, number, number]): Rect => {
  const [x0, y0, x1, y1] = corners
  const from = toScreen(frame, Math.min(x0, x1), Math.min(y0, y1))
  const to = toScreen(frame, Math.max(x0, x1), Math.max(y0, y1))

  return {
    x: from.x,
    y: from.y,
    width: Math.max(1, to.x - from.x),
    height: Math.max(1, to.y - from.y),
  }
}

/**
 * Тот же ли это дисплей, что на снимке: id, место, размер и плотность. Человек отключил монитор,
 * поменял разрешение или расположение экранов - точки старого снимка уже не те.
 */
export const isSameDisplay = (shot: Display, now: Display | undefined): boolean =>
  now !== undefined &&
  now.id === shot.id &&
  now.scaleFactor === shot.scaleFactor &&
  now.bounds.x === shot.bounds.x &&
  now.bounds.y === shot.bounds.y &&
  now.bounds.width === shot.bounds.width &&
  now.bounds.height === shot.bounds.height

/**
 * Как двигается рука человека (ADR 0044): мышь идёт к цели кривой с разгоном и торможением
 * (минимальный рывок), дольше на дальнее и мелкое (закон Фиттса), на длинном пути иногда
 * проскакивает и возвращается; нажимает не в геометрический центр; держит кнопку, а не щёлкает
 * за ноль миллисекунд; печатает по клавише неровным ритмом; крутит колесо серией толчков.
 * Чистые функции: случайность приходит снаружи, тест даёт свою.
 */

import { BrowserError } from './browser-error'

export type Point = { x: number; y: number }

/** Шаг пути: где мышь и когда, в миллисекундах от начала движения. */
export type MoveStep = Point & { at: number }

/** Источник случайности от 0 до 1 (Math.random; в тесте - своя последовательность). */
export type Random = () => number

/** Время и случайность действий: живые - у человека, мгновенные - в тестах. */
export type Motion = {
  random: Random
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** Шаг событий движения: столько у мыши примерно и выходит - 60 событий в секунду. */
const FRAME_MS = 16

/** Закон Фиттса: время = a + b · log2(1 + путь / ширина цели). */
const FITTS_A_MS = 80
const FITTS_B_MS = 95
const TARGET_WIDTH_PX = 12
const MIN_MOVE_MS = 120
const MAX_MOVE_MS = 900

/** Изгиб пути: доля длины и потолок в пикселях - дуга, а не крюк. */
const BEND_MIN = 0.04
const BEND_MAX = 0.16
const BEND_CAP_PX = 110

/** Проскок дальнего пути: с какой длины, как часто и насколько. */
const OVERSHOOT_FROM_PX = 320
const OVERSHOOT_CHANCE = 0.35
const OVERSHOOT_SHARE = 0.03
const OVERSHOOT_CAP_PX = 14
const CORRECTION_MS = 90

const between = (random: Random, min: number, max: number) => min + (max - min) * random()

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Приблизительно нормальное от -1 до 1: сумма трёх равномерных - пик в середине. */
const centered = (random: Random) => (random() + random() + random()) / 1.5 - 1

/** Профиль минимального рывка: разгон и торможение без скачков ускорения. */
export const minimumJerk = (t: number): number => t * t * t * (10 - 15 * t + 6 * t * t)

const bezier = (p0: Point, p1: Point, p2: Point, p3: Point, s: number): Point => {
  const u = 1 - s

  return {
    x: u * u * u * p0.x + 3 * u * u * s * p1.x + 3 * u * s * s * p2.x + s * s * s * p3.x,
    y: u * u * u * p0.y + 3 * u * u * s * p1.y + 3 * u * s * s * p2.y + s * s * s * p3.y,
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100

/** Сколько рука идёт до цели: дальнее - дольше, но не бесконечно; немного по-разному каждый раз. */
export const moveDurationOf = (distance: number, random: Random): number =>
  Math.round(
    clamp(
      (FITTS_A_MS + FITTS_B_MS * Math.log2(1 + distance / TARGET_WIDTH_PX)) *
        between(random, 0.85, 1.15),
      MIN_MOVE_MS,
      MAX_MOVE_MS,
    ),
  )

/** Одна дуга от from до to за duration мс: шаги кадрами, время - профилем минимального рывка. */
const arc = (
  from: Point,
  to: Point,
  duration: number,
  start: number,
  random: Random,
): MoveStep[] => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.hypot(dx, dy)
  // Перпендикуляр к пути: изгиб в одну сторону, вторая опора - слабее первой.
  const normal = distance > 0 ? { x: -dy / distance, y: dx / distance } : { x: 0, y: 0 }
  const side = random() < 0.5 ? -1 : 1
  const bend = Math.min(BEND_CAP_PX, distance * between(random, BEND_MIN, BEND_MAX)) * side
  const first = between(random, 0.2, 0.4)
  const second = between(random, 0.6, 0.8)
  const p1 = {
    x: from.x + dx * first + normal.x * bend,
    y: from.y + dy * first + normal.y * bend,
  }
  const p2 = {
    x: from.x + dx * second + normal.x * bend * 0.5,
    y: from.y + dy * second + normal.y * bend * 0.5,
  }
  const count = Math.max(3, Math.round(duration / FRAME_MS))

  return Array.from({ length: count }, (_, index) => {
    const t = (index + 1) / count
    const point = index + 1 === count ? to : bezier(from, p1, p2, to, minimumJerk(t))

    return { x: round2(point.x), y: round2(point.y), at: Math.round(start + duration * t) }
  })
}

/**
 * Путь руки от from до to: дуга с разгоном и торможением, на длинном пути иногда проскок за
 * цель и короткая доводка. Последний шаг - ровно to. Совсем рядом - один шаг.
 */
export const humanPath = (from: Point, to: Point, random: Random): MoveStep[] => {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)

  if (distance < 1) return [{ ...to, at: 0 }]

  const duration = moveDurationOf(distance, random)

  if (distance < OVERSHOOT_FROM_PX || random() >= OVERSHOOT_CHANCE) {
    return arc(from, to, duration, 0, random)
  }

  const reach = Math.min(OVERSHOOT_CAP_PX, distance * OVERSHOOT_SHARE)
  const past = {
    x: to.x + ((to.x - from.x) / distance) * reach + centered(random) * 2,
    y: to.y + ((to.y - from.y) / distance) * reach + centered(random) * 2,
  }

  return [
    ...arc(from, past, duration, 0, random),
    ...arc(past, to, CORRECTION_MS, duration, random),
  ]
}

/** Коробка элемента на странице: левый верхний угол и размер. */
export type Box = { x: number; y: number; width: number; height: number }

/** Разброс точки нажатия от центра: доля размера и потолок - внутри мелкого, не мимо крупного. */
const AIM_SPREAD = 0.18
const AIM_CAP_PX = 18

/**
 * Куда нажать в элементе: не в геометрический центр, а рядом с ним, как человек, - но внутри
 * средней части, чтобы у крупного элемента не попасть в соседнюю кнопку в его углу.
 */
export const aimInside = (box: Box, random: Random): Point => {
  const spread = (size: number) => Math.min(AIM_CAP_PX, size * AIM_SPREAD)

  return {
    x: Math.round(box.x + box.width / 2 + centered(random) * spread(box.width)),
    y: Math.round(box.y + box.height / 2 + centered(random) * spread(box.height)),
  }
}

/** Пауза у цели перед нажатием: рука останавливается, потом жмёт. */
export const settleMs = (random: Random) => Math.round(between(random, 40, 130))

/** Сколько держит кнопку мыши или клавишу. */
export const holdMs = (random: Random) => Math.round(between(random, 55, 120))

/** Между двумя нажатиями двойного клика. */
export const doubleGapMs = (random: Random) => Math.round(between(random, 70, 130))

/**
 * Пауза перед следующим знаком при наборе: обычный - 35-110 мс, после пробела и знака
 * препинания рука задерживается дольше, иногда - заметно (подумал).
 */
export const keyGapMs = (previous: string, random: Random): number => {
  const base = between(random, 35, 110)
  const afterWord = /[\s.,;:!?]/.test(previous) ? between(random, 30, 140) : 0
  const thought = random() < 0.04 ? between(random, 150, 380) : 0

  return Math.round(base + afterWord + thought)
}

/** Длиннее этого текст человек скорее вставит, чем наберёт: набор шёл бы десятки секунд. */
export const TYPE_BY_KEYS_MAX = 80

/** Толчок колеса: сколько пикселей прокрутки и через сколько мс после начала. */
export type WheelTick = { dx: number; dy: number; at: number }

const WHEEL_STEP_PX = 70
const WHEEL_MIN_TICKS = 3
const WHEEL_MAX_TICKS = 30

/**
 * Прокрутка серией толчков, как трекпад: сначала крупные, к концу мельче (инерция), сумма -
 * ровно dx и dy. Кадр на толчок.
 */
export const wheelTicks = (dx: number, dy: number): WheelTick[] => {
  const count = clamp(
    Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / WHEEL_STEP_PX),
    WHEEL_MIN_TICKS,
    WHEEL_MAX_TICKS,
  )
  // Доли - по убывающей: толчок i весит (count - i).
  const weights = Array.from({ length: count }, (_, index) => count - index)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let sentX = 0
  let sentY = 0

  return weights.map((weight, index) => {
    const last = index === count - 1
    const tickX = last ? dx - sentX : Math.round((dx * weight) / total)
    const tickY = last ? dy - sentY : Math.round((dy * weight) / total)

    sentX += tickX
    sentY += tickY

    return { dx: tickX, dy: tickY, at: index * FRAME_MS }
  })
}

const cancelled = () => new BrowserError('aborted', 'The call was cancelled.')

/** Живое время: паузы настоящие, отмена вызова инструмента их прерывает. */
export const HUMAN_MOTION: Motion = {
  random: Math.random,
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (ms <= 0) return resolve()
      if (signal?.aborted) return reject(cancelled())

      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', stop)
        resolve()
      }, ms)
      const stop = () => {
        clearTimeout(timer)
        reject(cancelled())
      }

      signal?.addEventListener('abort', stop, { once: true })
    }),
}

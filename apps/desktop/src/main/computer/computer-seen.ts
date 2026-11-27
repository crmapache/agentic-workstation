import { isSameDisplay } from './computer-geometry'
import type { Display, ShotFrame } from './computer-geometry'
import { INPUT_JITTER_MS } from './computer.constants'
import type { Point } from './computer.types'
import { stackAt, isSameStack } from './screen-scene'
import type { Scene, ScreenWitness } from './screen-scene'

/** Что известно об экране помимо картинки: когда был последний ввод (часы now) и какие окна. */
export type Glance = { inputAt: number | null; scene: Scene | null }

/**
 * Последний снимок разговора - то, что модель видела, когда называла точки (ADR 0129): кадр,
 * когда снят (Date.now), сколько к тому времени было пауз и отпусканий компьютера, и что было
 * на экране помимо картинки.
 */
export type Seen = Glance & { frame: ShotFrame; at: number; pauses: number; letGos: number }

/** Счётчики стола: паузы человека и сколько раз компьютер отпускали. */
export type DeskMarks = { pauses: number; letGos: number }

const NO_SHOT = 'You have no screenshot of the screen yet.'

const PAUSED_SINCE = 'The user paused you after your latest screenshot.'

const LAYOUT_CHANGED =
  'The displays changed after your latest screenshot (one was connected, removed or resized).'

const USER_INPUT = 'The user used the mouse or keyboard after your latest screenshot.'

const WINDOWS_MOVED =
  'The windows where you aimed changed after your latest screenshot: one opened, closed, moved ' +
  'or came to the front.'

const FOCUS_MOVED =
  'Another window came to the front after your latest screenshot, and the keys would go there.'

/** Действие не сделано, и модель смотрит на экран заново - по свежему снимку в том же ответе. */
export const LOOK_AGAIN =
  'Nothing was done: this screenshot shows the screen now. Look at it and decide again.'

/** Для zoom: свежего снимка в его ответе нет. */
export const SHOOT_AGAIN = 'Take a new screenshot.'

/** Возраст снимка словами: секунды, минуты, часы. */
export const ageOf = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))

  if (seconds < 90) return `${seconds} s`

  const minutes = Math.round(seconds / 60)

  return minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 60)} h`
}

const brokeOff = (ms: number) =>
  `Your latest screenshot is ${ageOf(ms)} old and from before a break: you stopped using the ` +
  'computer, and the user may have used it since.'

/**
 * Что знает свидетель экрана прямо сейчас. Его сбой - не повод стоять: проверка экрана -
 * страховка поверх остальных, и без неё работают пауза, перерыв и expect.
 */
export const glance = (witness: ScreenWitness, now: number): Glance => {
  const read = <T>(what: string, ask: () => T | null): T | null => {
    try {
      return ask()
    } catch (error) {
      console.warn(`[computer] cannot read ${what}:`, error)

      return null
    }
  }
  const idle = read('the last input time', witness.idleMs)

  return { inputAt: idle === null ? null : now - idle, scene: read('the windows', witness.scene) }
}

/**
 * Почему снимок не годится для действия, не глядя на экран: его нет, после него была пауза или
 * перерыв (человек мог работать сам), дисплей уже не тот. Годится - null.
 */
export const outdated = (
  seen: Seen | undefined,
  desk: DeskMarks,
  display: Display | undefined,
  now: number,
): string | null => {
  if (!seen) return NO_SHOT

  if (seen.pauses !== desk.pauses) return PAUSED_SINCE

  if (seen.letGos !== desk.letGos) return brokeOff(now - seen.at)

  return isSameDisplay(seen.frame.display, display) ? null : LAYOUT_CHANGED
}

/**
 * Человек трогал мышь или клавиатуру после снимка: последний ввод позже того, что был при снимке.
 * Свои события рука шлёт до снимка после действия, так что после снимка ввод - чужой. Свидетель не
 * знает - false.
 */
export const isTouchedSince = (seen: Glance, now: Glance): boolean =>
  seen.inputAt !== null && now.inputAt !== null && now.inputAt - seen.inputAt > INPUT_JITTER_MS

/**
 * Что поменялось на экране после снимка, прямо перед действием (ADR 0129): человек трогал мышь
 * или клавиатуру - или окна в точках действия (points), а у клавиатуры (точек нет) - окна перед
 * ней. Ничего - null. Чего свидетель не знает, то не сверяется.
 */
export const changedSince = (seen: Seen, now: Glance, points: readonly Point[]): string | null =>
  isTouchedSince(seen, now) ? USER_INPUT : windowsChangedAt(seen, now, points)

/**
 * Только окна: в точках (points) или, без точек, перед клавиатурой. Метке показа Walkthrough
 * (ADR 0134) ввод человека не помеха - слушая, он двигает мышь, - а окно, уехавшее из-под неё,
 * помеха.
 */
export const windowsChangedAt = (
  seen: Glance,
  now: Glance,
  points: readonly Point[],
): string | null => {
  const before = seen.scene
  const after = now.scene

  if (!before || !after) return null

  if (points.length === 0) {
    return isSameStack(stackAt(before, null), stackAt(after, null)) ? null : FOCUS_MOVED
  }

  const isMoved = points.some(
    (point) => !isSameStack(stackAt(before, point), stackAt(after, point)),
  )

  return isMoved ? WINDOWS_MOVED : null
}

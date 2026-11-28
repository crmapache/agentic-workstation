import type { Glance } from '../computer/computer-seen'
import { INPUT_JITTER_MS } from '../computer/computer.constants'
import { isSameStack } from '../computer/screen-scene'
import type { Timer } from '../voice/call/utterances'

/**
 * Чем кончилось ожидание человека (ADR 0134, 0135): он что-то сделал и затих, сказал что-то (и
 * нарисовал к этому drawn пометок), время вышло или он молчит, модель начала ждать заново, показ
 * кончился.
 */
export type UserMove =
  | { kind: 'acted' }
  | { kind: 'said'; text: string; drawn: number }
  | { kind: 'timeout' }
  | { kind: 'replaced' }
  | { kind: 'ended' }

/** Как часто смотреть на экран, пока человек делает шаг. */
const LOOK_MS = 400

/**
 * Сколько тишины после ввода значит «сделал»: клик, набор или перетаскивание кончились, а не
 * пауза между двумя движениями.
 */
export const SETTLED_MS = 2000

/**
 * Смотреть, сделал ли человек шаг: тронул мышь или клавиатуру после начала (или окна поменялись
 * сами) и затих на SETTLED_MS - тогда done('acted'); limitMs прошло - done('timeout'). Модель
 * проверит снимком, тот ли это шаг: движение мыши без клика тоже «тронул», и это её дело решить,
 * что шаг ещё не сделан. Пока у него в руке инструмент показа (isHolding), он рисует, а не делает
 * шаг. Ответ - остановить слежку.
 */
export const watchForUser = (options: {
  glance: () => Glance
  quietMs: () => number | null
  isHolding: () => boolean
  timer: Timer
  limitMs: number
  done: (move: UserMove) => void
}): (() => void) => {
  const start = options.glance()
  let cancelLook = (): void => undefined
  let cancelLimit = (): void => undefined
  let isOver = false
  const finish = (move: UserMove) => {
    if (isOver) return

    isOver = true
    cancelLook()
    cancelLimit()
    options.done(move)
  }
  const look = () => {
    if (isOver) return

    const isSettled = (options.quietMs() ?? SETTLED_MS) >= SETTLED_MS

    if (!options.isHolding() && hasMoved(start, options.glance()) && isSettled) {
      finish({ kind: 'acted' })

      return
    }

    cancelLook = options.timer(look, LOOK_MS)
  }

  cancelLimit = options.timer(() => finish({ kind: 'timeout' }), options.limitMs)
  cancelLook = options.timer(look, LOOK_MS)

  return () => {
    isOver = true
    cancelLook()
    cancelLimit()
  }
}

/** Человек тронул ввод после начала или окна экрана поменялись. Свидетель не знает - нет. */
export const hasMoved = (start: Glance, now: Glance): boolean => {
  const isTouched =
    start.inputAt !== null && now.inputAt !== null && now.inputAt - start.inputAt > INPUT_JITTER_MS
  const isRearranged =
    start.scene !== null && now.scene !== null && !isSameStack(start.scene, now.scene)

  return isTouched || isRearranged
}

/** Как часто считать тишину на вопрос показа. */
const SILENCE_TICK_MS = 250

/**
 * Ждать тишины на вопрос (ADR 0135): ms без слов человека. Пока он говорит (isHearing - живой
 * текст реплики не пуст), время не идёт: договорит - реплика сама станет ответом. Ответ -
 * остановить счёт.
 */
export const waitForSilence = (options: {
  isHearing: () => boolean
  timer: Timer
  ms: number
  done: () => void
}): (() => void) => {
  let silentMs = 0
  let cancel = (): void => undefined
  const tick = () => {
    silentMs = options.isHearing() ? 0 : silentMs + SILENCE_TICK_MS

    if (silentMs >= options.ms) options.done()
    else cancel = options.timer(tick, SILENCE_TICK_MS)
  }

  cancel = options.timer(tick, SILENCE_TICK_MS)

  return () => cancel()
}

import type { EngineCore } from './engine-core'
import { judgeTheCard } from './engine-walk'
import type { ScenarioSession } from './scenario-session'

/**
 * Ход карточки: конец, начатый ею самой ход, фоновые помощники (closeCardTurn,
 * onCardTurnStarted, turnOver в ACC). Конец хода, пока помощники работают, - ещё не ответ:
 * их отчёты сами поднимут следующий ход.
 */

/** Сказанное на конце хода, пока помощники работают, - копится, а не теряется. */
const holdWhileHelpersWork = (e: EngineCore): boolean => {
  if (!e.helpers?.busy()) return false

  e.heldEndings = [...e.heldEndings, ...e.cardTurn.last]
  e.cardTurn.clear()

  return true
}

/** Ход кончился: голове - или ждать помощников в фазе карточки, с её часами. */
export const turnOver = (e: EngineCore): void => {
  if (!holdWhileHelpersWork(e)) return judgeTheCard(e)

  e.cardTurnEnded = false
  e.cardWaits = true

  if (e.phase === 'card') return

  e.phase = 'card'
  e.run = { ...e.run, state: 'running' }
  e.editHere((step) => ({ ...step, state: 'running' }))
}

/**
 * Конец хода карточки. Под стоящим вопросом он запоминается, а не теряется: ход умер с
 * вопросом (лимит, сеть), и иначе прогон ждал бы его до трёхчасового потолка.
 */
export const onCardTurnEnded = (e: EngineCore, from: ScenarioSession): void => {
  if (e.card !== from || e.interrupting || e.phase === 'over') return

  const onQuestion = e.phase === 'question' || e.phase === 'blocked'
  const pausedOnQuestion =
    e.phase === 'paused' && (e.resumeTo === 'question' || e.resumeTo === 'blocked')

  if (onQuestion || pausedOnQuestion) {
    e.cardTurnEnded = true
    holdWhileHelpersWork(e)

    return
  }

  if (e.phase === 'card') turnOver(e)
}

/** Умерший под вопросом ход снова жив: сказанное копится, ждём конца нового. */
const cardIsBack = (e: EngineCore) => {
  if (!e.cardTurnEnded) return

  e.cardTurnEnded = false
  e.heldEndings = [...e.heldEndings, ...e.cardTurn.last]
  e.cardTurn.clear()
}

/**
 * Карточка начала ход сама: отчёт помощника разбудил её. Ждали помощников - так и надо. Уже
 * под судом - она не закончила: вопрос забирается у головы, судят на конце этого хода. На
 * паузе тормоз держит: ход прерывается, «продолжай» пойдёт карточке.
 */
export const onCardTurnStarted = (e: EngineCore, from: ScenarioSession): void => {
  if (e.card !== from) return

  if (e.phase === 'card') {
    e.cardWaits = false

    return
  }

  if (e.phase === 'verdict') {
    if (e.answeringPerson) e.deferred = false
    else {
      e.interrupting = true
      e.head?.interrupt()
      e.interrupting = false
    }

    e.pendingHead = ''
    e.headAskedAt = 0
    e.heldEndings = [...e.heldEndings, ...e.judged]
    e.judged = []
    e.cardTurn.clear()
    e.phase = 'card'
    e.editHere((step) => ({ ...step, state: 'running' }))
    e.changed()

    return
  }

  if (e.phase === 'question' || e.phase === 'blocked') return cardIsBack(e)
  if (e.phase !== 'paused') return

  if (e.resumeTo === 'card' || e.resumeTo === 'verdict') {
    e.interrupting = true
    e.card.interrupt()
    e.interrupting = false

    if (e.resumeTo === 'verdict') {
      e.pendingHead = ''
      e.headAskedAt = 0
      e.deferred = false
    }

    e.resumeTo = 'card'
  } else if ((e.resumeTo === 'question' || e.resumeTo === 'blocked') && e.cardTurnEnded) {
    cardIsBack(e)
    e.interrupting = true
    e.card.interrupt()
    e.interrupting = false
  }
}

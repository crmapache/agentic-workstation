import { askAgain } from './engine-asking'
import type { EngineCore } from './engine-core'
import { CARD_PHASES, HEAD_PHASES, CARD_CEILING_MS, HEAD_CEILING_MS } from './engine-core'
import { deliverTold } from './engine-mail'
import { putQuestion } from './engine-questions'
import { takeOver, canTakeOver } from './engine-takeover'
import { judgeTheCard, freshCardTurn } from './engine-walk'
import { CARRY_ON, CARD_CARRY_ON, TAKE_OVER_CARRY_ON } from './head-person'

/**
 * Пауза, продолжение, стоп и потолки (pause / resume / tick в ACC). Пауза - полный стоп, но
 * ничего не умирает: ход обрывается, процессы живут и помнят. Карточку на вопросе не прерывают
 * вовсе: прерывание убило бы сам вопрос.
 */

/** Сердце паузы - общее с переездом на другой аккаунт. */
export const halt = (e: EngineCore): void => {
  e.interrupting = true
  e.hold()

  // Голова, отвечающая человеку, договаривает: обсудить прогон - частая причина паузы.
  if (!e.answeringPerson) e.head?.interrupt()
  if (e.phase === 'card') e.card?.interrupt()

  e.interrupting = false
  e.resumeTo = e.phase
  e.phase = 'paused'
  e.run = {
    ...e.run,
    state: 'paused',
    steps: e.run.steps.map((step) =>
      ['waiting', 'done', 'failed', 'skipped'].includes(step.state)
        ? step
        : { ...step, state: 'paused' as const },
    ),
  }
}

/** Слова, которыми карточку продолжают; что голова держала против неё - тоже. */
export const carryOnWords = (reason: string): string =>
  reason.trim()
    ? `${CARD_CARRY_ON} The main thread judged it not done yet: ${reason}`
    : CARD_CARRY_ON

/** Сердце продолжения - общее с переездом и концом ожидания лимита. */
export const carryOnFromPause = (e: EngineCore): void => {
  if (e.phase !== 'paused') return

  // Вопрос, пришедший во время паузы и никому не заданный: продолжить - значит задать его.
  const waiting = e.resumeTo === 'card' ? e.questions[0] : undefined
  const step = e.step

  if (waiting && step) {
    if (e.scenario.head.onQuestion !== 'stop') e.release()

    e.run = { ...e.run, state: 'running' }
    e.editStep(step.key, (one) => ({ ...one, state: 'asking' }))
    putQuestion(e, step, waiting)

    if (e.forCardOnResume && e.card?.sendPrompt(e.forCardOnResume)) e.forCardOnResume = ''

    return deliverTold(e)
  }

  // Часы карточки не идут, пока вопрос ждёт человека: включить их некому было бы утром.
  if (e.resumeTo !== 'blocked') e.release()

  e.phase = e.resumeTo
  e.run = { ...e.run, state: e.phase === 'blocked' ? 'blocked' : 'running' }

  if (e.phase === 'card') {
    e.editHere((one) => ({ ...one, state: 'running' }))
    e.windCardClock()
    freshCardTurn(e)

    // Карточка без разговора на диске ничего не помнит - ей дают работу заново.
    const words = e.cardStartsOver ? e.step?.prompt || CARD_CARRY_ON : CARD_CARRY_ON
    const said = [words, e.forCardOnResume].filter(Boolean).join('\n\n')

    if (e.card?.sendPrompt(said)) {
      e.cardStartsOver = false
      e.forCardOnResume = ''
    }
  } else if (e.phase === 'blocked') {
    e.editHere((one) => ({ ...one, state: 'asking' }))
  } else if (e.phase === 'takeover') {
    e.editHere((one) => ({ ...one, state: 'running' }))
    e.windCardClock()
    askAgain(e, TAKE_OVER_CARRY_ON)
  } else if (HEAD_PHASES.has(e.phase)) {
    e.editHere((one) => ({ ...one, state: 'judging' }))
    askAgain(e, e.pendingHead || CARRY_ON)
  }

  if (e.forCardOnResume && CARD_PHASES.has(e.phase) && e.card?.sendPrompt(e.forCardOnResume)) {
    e.forCardOnResume = ''
  }

  e.changed()
  deliverTold(e)
}

/** Всё работает, пока не прошла работа карточки (или головы на её месте) - три часа. */
const pastTheCeiling = (e: EngineCore): boolean => {
  if (e.cardStartedAt === 0) return false

  const parked = e.pausedFor + (e.pausedAt > 0 ? Date.now() - e.pausedAt : 0)

  return Date.now() - e.cardStartedAt - parked >= CARD_CEILING_MS
}

/** Карточка ждёт помощников, а ждать некого; или перебежала потолок. */
const watchTheCard = (e: EngineCore) => {
  if (e.cardWaits && !e.helpers?.busy()) return judgeTheCard(e, e.helpers?.overdue() ?? false)
  if (!pastTheCeiling(e)) return

  const step = e.step

  if (!step) return

  if (canTakeOver(e, false)) {
    return takeOver(e, step, 'it ran past its time (3 hours)', step.said || step.summary)
  }

  e.editStep(step.key, (one) => ({ ...one, failure: 'tooLong' }))
  e.end('failed', 'tooLong', `${step.title}: it ran past its time`)
}

/** Удар часов: то, что может стоять вечно, - карточка, голова на её месте, молчащая голова. */
export const tick = (e: EngineCore): void => {
  const now = Date.now()

  if (e.answeringPerson && e.personAskedAt > 0 && now - e.personAskedAt >= HEAD_CEILING_MS) {
    return e.end('failed', 'headSilent', 'the main thread stopped answering')
  }

  if (e.phase === 'card') return watchTheCard(e)

  if (e.phase === 'takeover' && pastTheCeiling(e)) {
    e.editHere((one) => ({ ...one, failure: 'tooLong' }))

    return e.end(
      'failed',
      'tooLong',
      `${e.step?.title ?? ''}: the main thread ran past its time finishing it`,
    )
  }

  if (e.headAskedAt > 0 && HEAD_PHASES.has(e.phase) && now - e.headAskedAt >= HEAD_CEILING_MS) {
    e.editHere((one) => ({ ...one, failure: 'headSilent' }))
    e.end('failed', 'headSilent', 'the main thread stopped answering')
  }
}

import { listKey } from '@shared/scenario-rules'

import type { EngineCore } from './engine-core'
import { HEAD_PHASES } from './engine-core'
import { heardBack, deliverTold } from './engine-mail'
import { answerCardQuestion } from './engine-questions'
import { takeOverVerdict } from './engine-takeover'
import { takeList, beginStep, startCard, takeVerdict, takeAnotherPass } from './engine-walk'
import { withTold, NO_OBJECT } from './head-person'
import { readEndings } from './head-reply'
import { waitingNotes, markDelivered, markUndelivered } from './run-mail'

/**
 * Вопросы голове и её ответы (askHead / closeHeadTurn в ACC). Одно разрешение ошибиться - на
 * вопрос: возобновляется только новым вопросом, иначе голова, повторяющая ту же ошибку,
 * переспрашивалась бы всю ночь.
 */

/** Слова человека, отданные голове с вопросом, - обратно ждать: процесс не поднялся. */
const notGiven = (e: EngineCore, stamps: readonly number[]) => {
  if (stamps.length > 0) e.run = { ...e.run, notes: markUndelivered(e.run.notes, stamps) }
}

/**
 * Тот же вопрос ещё раз - разрешение не возобновляется. Ждавшие слова человека едут первыми;
 * голову, отвечающую человеку, не перебивают: вопрос ждёт конца её хода.
 */
export const askAgain = (e: EngineCore, text: string): void => {
  e.pendingHead = text

  if (e.answeringPerson) {
    e.deferred = true
    e.headAskedAt = 0

    return
  }

  e.deferred = false

  const session = e.head

  if (!session) return

  e.headAskedAt = Date.now()
  e.headTurn.clear()

  const told = waitingNotes(e.run.notes)

  if (told.length > 0) e.run = { ...e.run, notes: markDelivered(e.run.notes, told, Date.now()) }

  const said =
    told.length > 0
      ? withTold(
          told.map((note) => note.text),
          text,
        )
      : text
  const images = told.flatMap((note) => e.toldImages.get(note.at) ?? [])

  e.headTalking = true

  if (session.sendPrompt(said, images)) {
    for (const note of told) e.toldImages.delete(note.at)
  } else {
    notGiven(
      e,
      told.map((note) => note.at),
    )
  }
}

/** Новый вопрос голове: разрешение ошибиться - снова одно. */
export const askHead = (e: EngineCore, text: string): void => {
  e.reasked = false
  askAgain(e, text)
}

/** Где ложатся фразы ответа: открытие - над всеми, список - в начале этапа, иначе - под карточкой. */
const aboutWhat = (e: EngineCore): string => {
  if (e.phase === 'opening') return ''
  if (e.phase === 'list') return e.step ? listKey(e.step.stageId) : ''

  return e.step?.key ?? ''
}

/** Ход головы закрылся: прочесть ответ и сделать то, о чём спрашивали. */
export const closeHeadTurn = (e: EngineCore): void => {
  e.headTalking = false

  if (e.answeringPerson) return heardBack(e)

  // Наше прерывание или ход, о котором ничего не спрашивали (пауза, отозванный вердикт), -
  // не ответ. Голова свободна - ждавшие слова человека идут ей сейчас.
  if (e.interrupting || (e.phase !== 'takeover' && !HEAD_PHASES.has(e.phase))) {
    if (!e.interrupting) deliverTold(e)

    return
  }

  const reply = readEndings(e.headTurn.last)

  if (reply.words.trim()) e.note(reply.words, aboutWhat(e))

  const { body } = reply

  if (!body) {
    // Ответ без объекта - переспросить один раз прямо, потом сдаться: голова, ответившая
    // прозой, ответит прозой снова, а цикл - это подписка, потраченная без свидетелей.
    if (e.reasked) return e.end('failed', 'noVerdict', 'the head never answered with an object')

    e.reasked = true
    askAgain(e, NO_OBJECT)

    return
  }

  e.pendingHead = ''
  e.headAskedAt = 0

  switch (e.phase) {
    case 'opening':
      beginStep(e)
      break
    case 'list':
      takeList(e, body)
      break
    case 'slots':
      startCard(e, body)
      break
    case 'question':
      answerCardQuestion(e, body)
      break
    case 'verdict':
      takeVerdict(e, body)
      break
    case 'again':
      takeAnotherPass(e, body)
      break
    case 'takeover':
      takeOverVerdict(e, body)
      break
    default:
      break
  }

  e.changed()
  deliverTold(e)
}

export { notGiven }

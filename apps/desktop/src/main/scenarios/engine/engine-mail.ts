import type { ImageAttachment } from '@shared/claude'
import { listKey } from '@shared/scenario-rules'

import { askAgain } from './engine-asking'
import type { Phase, EngineCore } from './engine-core'
import { shorten, CARD_PHASES, HEAD_PHASES, WAITING_PHASES } from './engine-core'
import { toldMidWork, toldRequest, relayedWords } from './head-person'
import { replyText, readEndings } from './head-reply'
import {
  mailWay,
  noteStamp,
  TOLD_CHARS,
  shownTokens,
  waitingNotes,
  markDelivered,
  markUndelivered,
} from './run-mail'

/**
 * Человек пишет голове, пока прогон идёт (tell / deliverTold / heardBack в ACC). Голова - один
 * разговор на весь прогон, так что сказанное ей держится до конца ночи без памяти с нашей
 * стороны. Слова и ответ ложатся в ленту под карточкой, на которой стоит прогон.
 */

const standing = (e: EngineCore): Phase => (e.phase === 'paused' ? e.resumeTo : e.phase)

/** Карточка, на которой стоит прогон; пусто - до первой, ключ списка - пока список спрашивают. */
export const boardKey = (e: EngineCore): string => {
  const phase = standing(e)

  if (phase === 'opening') return ''
  if (phase === 'list') return e.step ? listKey(e.step.stageId) : ''

  return e.step?.key ?? ''
}

/** Есть ли карточка, которой голова может передать слова. */
const canPassOn = (e: EngineCore): boolean =>
  e.card !== null &&
  (CARD_PHASES.has(e.phase) || (e.phase === 'paused' && CARD_PHASES.has(e.resumeTo)))

/** Где стоит прогон - фразой для головы. */
const situation = (e: EngineCore): string => {
  const step = e.step
  const named = step
    ? `card ${e.at + 1} of ${e.run.total}, "${step.title.trim() || 'Untitled'}"`
    : null
  const stage = e.stageOf(step)?.title.trim() || 'Untitled'
  const where =
    ((): string | null => {
      switch (standing(e)) {
        case 'opening':
          return 'The run has only just begun: no card has been handed to you yet.'
        case 'list':
          return `The run is going: the stage "${stage}" has begun, and you are being asked for its list.`
        case 'card':
          return named && `The run is going: ${named} is at work right now.`
        case 'blocked':
          return (
            named &&
            `The run is going: ${named} has stopped on a question, and it waits for the person to answer it.`
          )
        case 'takeover':
          return named && `You were finishing ${named} yourself.`
        default:
          return named && `The run is going: it stands at ${named}.`
      }
    })() ?? 'The run is going.'

  return e.phase === 'paused'
    ? `${where} The person has paused the run: nothing is working until they resume it, and nothing about a card is asked of you meanwhile.`
    : where
}

/** Отдать голове слова человека, если она может их читать сейчас. */
export const deliverTold = (e: EngineCore): void => {
  // Голове, которую меняют или которой отказывает лимит, - ничего: слово умерло бы сразу.
  if (e.phase === 'over' || e.settlingAccount() || e.refusedHere()) return

  const told = waitingNotes(e.run.notes)
  const session = e.head

  if (told.length === 0 || !session) return

  const way = mailWay({
    headUp: true,
    turnOpen: e.headTalking,
    answeringPerson: e.answeringPerson,
    doingCardWork: e.phase === 'takeover',
    waitingOnOthers: WAITING_PHASES.has(e.phase),
  })
  const now = Date.now()

  if (way === 'later') return

  if (way === 'intoWork') {
    e.run = { ...e.run, notes: markDelivered(e.run.notes, told, now) }

    const images = told.flatMap((note) => e.toldImages.get(note.at) ?? [])

    if (session.sendPrompt(toldMidWork(told.map((note) => note.text)), images)) {
      for (const note of told) e.toldImages.delete(note.at)
    } else {
      e.run = {
        ...e.run,
        notes: markUndelivered(
          e.run.notes,
          told.map((note) => note.at),
        ),
      }
    }

    return e.changed()
  }

  const images = new Map(
    told.flatMap((note) => {
      const kept = e.toldImages.get(note.at)

      return kept ? [[note.at, kept] as const] : []
    }),
  )

  for (const at of images.keys()) e.toldImages.delete(at)

  e.run = { ...e.run, notes: markDelivered(e.run.notes, told, now), answering: true }
  e.carrying = told.map((note) => note.at)
  e.carryingImages = images
  e.answeringPerson = true
  e.personAskedAt = now
  e.headTurn.clear()
  e.headTalking = true

  const sent = session.sendPrompt(
    toldRequest(
      told.map((note) => note.text),
      situation(e),
      canPassOn(e),
    ),
    [...images.values()].flat(),
  )

  if (!sent) {
    for (const [at, kept] of images) e.toldImages.set(at, kept)

    e.run = {
      ...e.run,
      answering: false,
      notes: markUndelivered(
        e.run.notes,
        told.map((note) => note.at),
      ),
    }
    e.answeringPerson = false
    e.personAskedAt = 0
    e.carrying = []
    e.carryingImages = new Map()
  }

  e.changed()
}

/**
 * Слова человека голове. Записаны в таймлайн сразу, под карточкой, на которой стоит прогон;
 * голове - как только она свободна. false - прогон кончился, его голова больше не читает.
 */
export const tell = (
  e: EngineCore,
  text: string,
  images: readonly ImageAttachment[],
  tokens: unknown,
): boolean => {
  const words = text.trim()

  if (e.phase === 'over' || (!words && images.length === 0)) return false

  const at = noteStamp(e.run.notes, Date.now())

  if (images.length > 0) e.toldImages.set(at, [...images])

  e.run = {
    ...e.run,
    notes: [
      ...e.run.notes,
      {
        at,
        stepKey: boardKey(e),
        text: shorten(words, TOLD_CHARS),
        who: 'person',
        deliveredAt: 0,
        relayed: '',
        tokens: shownTokens(tokens),
      },
    ],
  }
  deliverTold(e)
  e.changed()

  return true
}

/**
 * Слова человека - карточке на доске: работающей - сразу, между её шагами; стоящей на
 * вопросе - CLI держит до ответа; на паузе - вместе со словами продолжения.
 */
const passOn = (e: EngineCore, words: string): string => {
  const session = e.card

  if (!session) return ''

  if (CARD_PHASES.has(e.phase)) {
    session.sendPrompt(relayedWords(words))

    return words
  }

  if (e.phase === 'paused' && CARD_PHASES.has(e.resumeTo)) {
    e.forCardOnResume = [e.forCardOnResume, relayedWords(words)].filter(Boolean).join('\n\n')

    return words
  }

  return ''
}

/** Голова ответила человеку: её слова - под его заметкой, вопрос прогона, ждавший её, - сейчас. */
export const heardBack = (e: EngineCore): void => {
  e.answeringPerson = false
  e.personAskedAt = 0
  e.carrying = []
  e.carryingImages = new Map()

  const reply = readEndings(e.headTurn.last)
  const words = reply.body ? replyText(reply.body, 'toCard').trim() : ''
  const passed = words ? passOn(e, words) : ''

  if (reply.words.trim() || passed) e.note(reply.words, boardKey(e), passed)

  e.run = { ...e.run, answering: false }

  const stillAsked =
    e.deferred && (HEAD_PHASES.has(e.phase) || e.phase === 'takeover') && e.pendingHead.trim()

  if (stillAsked) askAgain(e, e.pendingHead)
  else {
    if (e.phase !== 'paused') e.deferred = false

    deliverTold(e)
  }

  e.changed()
}

import { fillInputs } from '@shared/scenario-rules'
import type { RunStep } from '@shared/scenario-runs'

import { askHead } from './engine-asking'
import type { EngineCore } from './engine-core'
import { shorten, SUMMARY_CHARS, TAKE_OVER_CHARS } from './engine-core'
import { raiseHead } from './engine-sessions'
import { nextStep } from './engine-walk'
import { takeOverRequest } from './head-judging'
import type { ReplyBody } from './head-reply'
import { replyFlag, replyText } from './head-reply'
import { takeOverWanted } from './run-mail'

/**
 * Голова доделывает карточку сама (настройка `onGiveUp: head`, TakeOver в ACC): то, что
 * человек утром делал руками, - в ту же минуту. Один раз на карточку и только голове с
 * памятью ночи: голова без разговора на диске - посторонний с полусделанной работой.
 */

export const canTakeOver = (e: EngineCore, stopAsked: boolean): boolean =>
  takeOverWanted(e.scenario.head, e.tookOver, stopAsked) &&
  Boolean(e.run.headConversationId) &&
  e.host.onDisk(e.run.headConversationId)

/**
 * Работу карточки - голове: карточка снимается (два процесса над одной рабочей копией - то,
 * от чего доска и есть), голова поднимается заново без забора и с доверием карточек. Часы -
 * карточные: три часа, как у любой работы здесь.
 */
export const takeOver = (e: EngineCore, step: RunStep, why: string, said: string | null): void => {
  const card = e.cardOf(step)

  if (!card)
    return e.end('failed', 'crashed', 'a step of this run points at a card that is not in it')

  e.tookOver = true
  e.closeCard()
  e.questions = []
  e.deciding = ''
  e.cardTurnEnded = false
  e.run = { ...e.run, state: 'running', question: null }
  e.editStep(step.key, (one) => ({
    ...one,
    state: 'running',
    takeOver: shorten(why, TAKE_OVER_CHARS),
    said: '',
    verdict: '',
    verdictReason: '',
  }))
  raiseHead(e, true)
  e.phase = 'takeover'
  e.windCardClock()
  askHead(
    e,
    takeOverRequest({
      card,
      prompt: step.prompt || fillInputs(card.prompt, e.run.inputs),
      why,
      said: said === null ? null : shorten(said, SUMMARY_CHARS),
      transcript: step.conversationId ? e.host.transcriptPath(step.conversationId) : null,
    }),
  )
  e.changed()
}

/**
 * Голова сказала, доделала ли. Доделала - снова прораб, с забором: следующая карточка - чужая
 * работа. Нет - прогон кончается под своим именем: карточку не смог доделать никто.
 */
export const takeOverVerdict = (e: EngineCore, body: ReplyBody): void => {
  const step = e.step

  if (!step) return

  const done = replyFlag(body, 'done') ?? false
  const reason = replyText(body, 'reason')

  e.editStep(step.key, (one) => ({
    ...one,
    state: done ? 'done' : 'failed',
    verdict: done ? 'done' : 'undone',
    verdictReason: reason,
    handoff: replyText(body, 'handoff'),
    finishedAt: Date.now(),
    failure: done ? '' : 'headGaveUp',
    error: done ? '' : reason,
    said: '',
  }))

  if (!done) return e.end('failed', 'headGaveUp', `${step.title}: ${reason || 'not done'}`)

  raiseHead(e, false)
  nextStep(e)
}

import {
  passesOf,
  fillSlots,
  fillInputs,
  slotsToFill,
  loopsUntilDone,
} from '@shared/scenario-rules'
import type { RunStep } from '@shared/scenario-runs'
import type { StageEach, ScenarioStage } from '@shared/scenarios'
import { MAX_STAGE_ITEMS } from '@shared/scenarios'

import { askHead, askAgain } from './engine-asking'
import type { EngineCore } from './engine-core'
import { shorten, SUMMARY_CHARS } from './engine-core'
import { openCard } from './engine-sessions'
import { takeOver, canTakeOver } from './engine-takeover'
import { verdictRequest, anotherPassRequest } from './head-judging'
import type { ReplyBody } from './head-reply'
import { replyFlag, replyText } from './head-reply'
import { AGAIN_CHARS, listRequest, handoverMessage } from './head-talk'
import { takeOverWanted } from './run-mail'
import { putOff, readList, afterPass, canPutOff, expandList } from './run-steps'

/**
 * Ход по плану: какая карточка следующая, сколько проходов, что голова заполняет, как
 * судят ответ (beginStep … takeAnotherPass в ACC). Форма круга - здесь; суждение - голове.
 */

/** Что пункт прохода вписывает в промпты этапа «по пункту». */
const itemSlot = (stage: ScenarioStage, step: RunStep): Record<string, string> =>
  stage.each && step.item ? { [stage.each.name]: step.item.value } : {}

/** Новая карточка с чистого листа: свои концовки, свои фоновые помощники. */
export const freshCardTurn = (e: EngineCore): void => {
  e.cardTurn.clear()
  e.heldEndings = []
  e.judged = []
  e.cardWaits = false
  e.cardTurnEnded = false
}

const askForList = (e: EngineCore, stage: ScenarioStage, each: StageEach, step: RunStep) => {
  e.editStep(step.key, (one) => ({ ...one, state: 'judging', startedAt: Date.now() }))
  e.phase = 'list'
  askHead(
    e,
    listRequest(
      stage,
      { ...each, description: fillInputs(each.description, e.run.inputs) },
      e.scenario.stages.findIndex((one) => one.id === stage.id) + 1,
      e.scenario.stages.length,
      stage.cards.map((card) => ({ card, prompt: fillInputs(card.prompt, e.run.inputs) })),
    ),
  )
  e.changed()
}

/** Передать голове карточку, на которой стоит доска. */
export const beginStep = (e: EngineCore): void => {
  const step = e.step

  if (!step) return e.end('done', '', '')

  const stage = e.stageOf(step)
  const card = e.cardOf(step)

  // Прогон идёт по снимку - правкой сюда не попасть, только уже битым файлом.
  if (!stage || !card) {
    return e.end('failed', 'crashed', 'a step of this run points at a card that is not in it')
  }

  if (stage.each && !step.item) return askForList(e, stage, stage.each, step)

  e.nudges = 0
  e.tookOver = false
  freshCardTurn(e)
  e.cardCost = 0
  e.editStep(step.key, (one) => ({
    ...one,
    state: 'judging',
    startedAt: Date.now(),
    title: card.title.trim() || one.title,
  }))
  e.phase = 'slots'
  askHead(
    e,
    handoverMessage({
      stage,
      card,
      index: e.at + 1,
      total: e.run.total,
      pass: step.pass,
      passes: passesOf(stage),
      prompt: fillSlots(fillInputs(card.prompt, e.run.inputs), itemSlot(stage, step)),
      retries: e.scenario.head.retries,
      handsOver: takeOverWanted(e.scenario.head, false, false),
      item: step.item ?? null,
    }),
  )
  e.changed()
}

const failOnList = (e: EngineCore, failure: 'longList' | 'noVerdict', error: string) => {
  e.editHere((step) => ({ ...step, failure }))
  e.end('failed', failure, error)
}

const askForListAgain = (e: EngineCore, named: string, what: string) => {
  if (e.reasked) return failOnList(e, 'noVerdict', `the head would not give the list of ${named}`)

  e.reasked = true
  askAgain(
    e,
    `${what} Answer again with the whole \`items\` list, every item an object with a \`value\` to write into the prompts and a \`label\` for the screen.`,
  )
}

/** Голова дала список: этап - по проходу на пункт; длиннее потолка - конец, не переспрос. */
export const takeList = (e: EngineCore, body: ReplyBody): void => {
  const step = e.step
  const stage = e.stageOf(step)

  if (!step || !stage) return

  const named = `the stage "${stage.title.trim() || 'Untitled'}"`
  const reading = readList(body)

  if (reading.kind === 'tooLong') {
    return failOnList(
      e,
      'longList',
      `the list of ${named} has ${reading.count} items, and a stage takes at most ${MAX_STAGE_ITEMS}`,
    )
  }

  if (reading.kind === 'unusable') {
    return askForListAgain(
      e,
      named,
      `Item ${reading.places.join(', ')} of the list had no value to write into the prompts.`,
    )
  }

  if (reading.kind === 'missing') return askForListAgain(e, named, 'No list came back.')

  const steps = expandList(e.run.steps, stage, reading.items, Date.now())

  e.run = { ...e.run, steps, total: steps.length }

  if (reading.items.length === 0) e.at = afterPass(steps, e.at)

  beginStep(e)
}

/** Голова заполнила слоты: промпт собран, карточка стартует. Пустой слот - переспрос один раз. */
export const startCard = (e: EngineCore, body: ReplyBody): void => {
  const step = e.step
  const stage = e.stageOf(step)
  const card = e.cardOf(step)

  if (!step || !stage || !card) return

  const given = body['slots']
  const slotsBody =
    typeof given === 'object' && given !== null && !Array.isArray(given) ? given : {}
  const wanted = slotsToFill(stage, card).map((slot) => slot.name)
  const filled = Object.fromEntries(
    wanted.map((name) => [name, replyText(slotsBody as ReplyBody, name)]),
  )
  const missing = wanted.filter((name) => !filled[name]?.trim())

  if (missing.length > 0) {
    if (e.reasked) {
      return e.end('failed', 'noVerdict', `the head would not fill: ${missing.join(', ')}`)
    }

    e.reasked = true
    askAgain(
      e,
      `No value came back for: ${missing.join(', ')}. Every slot has to be filled before the card can start. Answer again with the whole \`slots\` object.`,
    )

    return
  }

  const slots = { ...itemSlot(stage, step), ...filled }
  const prompt = fillSlots(fillInputs(card.prompt, e.run.inputs), slots)

  e.editStep(step.key, (one) => ({ ...one, slots, prompt, state: 'running', said: '' }))
  e.card = openCard(e, step, card)
  e.phase = 'card'
  e.windCardClock()
  e.card.sendPrompt(prompt)
}

/** Ход карточки кончился и ждать больше некого: отдать голове всё, что она сказала. */
export const judgeTheCard = (e: EngineCore, overdue = false): void => {
  const step = e.step
  const card = e.cardOf(step)

  if (!step || !card) return

  e.cardTurnEnded = false
  e.cardWaits = false

  const waited = e.heldEndings.length > 0
  const endings = [...e.heldEndings, ...e.cardTurn.last]
  const answer = endings.join('\n\n')

  e.heldEndings = []
  e.judged = endings
  e.editStep(step.key, (one) => ({
    ...one,
    state: 'judging',
    said: '',
    summary: shorten(answer, SUMMARY_CHARS),
  }))
  e.phase = 'verdict'
  askHead(
    e,
    verdictRequest({
      card,
      endings,
      waited,
      overdue,
      ok: answer.trim().length > 0,
      nudgesLeft: Math.max(0, e.scenario.head.retries - e.nudges),
      handsOver: canTakeOver(e, false),
      putOff: canPutOff(step),
    }),
  )
  e.changed()
}

/** Пункт отложен: шаг - сделан с вердиктом later, второй заход - в конец этапа. */
const putOffItem = (e: EngineCore, step: RunStep, reason: string, body: ReplyBody) => {
  e.closeCard()

  const now = Date.now()

  e.editStep(step.key, (one) => ({
    ...one,
    state: 'done',
    verdict: 'later',
    verdictReason: reason,
    handoff: replyText(body, 'handoff'),
    finishedAt: now,
  }))

  const steps = putOff(e.run.steps, e.at, shorten(reason, AGAIN_CHARS), now)

  e.run = { ...e.run, steps, total: steps.length }
  e.at = afterPass(steps, e.at)
  beginStep(e)
}

/** Вердикт головы: ещё раз, отложить, сделано, не сделано (и забрать ли работу). */
export const takeVerdict = (e: EngineCore, body: ReplyBody): void => {
  const step = e.step

  if (!step) return

  const retry = replyText(body, 'retry')
  const reason = replyText(body, 'reason')
  const later = replyText(body, 'later')

  if (retry.trim() && e.nudges < e.scenario.head.retries) {
    e.nudges += 1
    e.editStep(step.key, (one) => ({
      ...one,
      state: 'running',
      nudges: [...one.nudges, retry],
      said: '',
    }))
    e.phase = 'card'
    e.windCardClock()
    freshCardTurn(e)
    e.card?.sendPrompt(retry)

    return
  }

  if (later.trim()) {
    if (canPutOff(step)) return putOffItem(e, step, later, body)

    if (!e.reasked) {
      e.reasked = true
      askAgain(
        e,
        'This card cannot be put off: only the first go at an item of a list can. Answer with `{"done": true}` or `{"done": false}`, and a `reason`.',
      )

      return
    }
  }

  const done = replyFlag(body, 'done') ?? (!retry.trim() && !later.trim())

  if (!done && canTakeOver(e, replyFlag(body, 'stop') ?? false)) {
    return takeOver(e, step, reason || 'the main thread judged it not done', null)
  }

  e.closeCard()

  const failure =
    e.nudges >= e.scenario.head.retries && e.scenario.head.retries > 0 ? 'retries' : 'undone'

  e.editStep(step.key, (one) => ({
    ...one,
    state: done ? 'done' : 'failed',
    verdict: done ? 'done' : 'undone',
    verdictReason: reason,
    handoff: replyText(body, 'handoff'),
    finishedAt: Date.now(),
    failure: done ? '' : failure,
    error: done ? '' : reason,
  }))

  // Всё после этой карточки писали в расчёте, что она случилась: дальше не идём.
  if (!done) return e.end('failed', failure, `${step.title}: ${reason || 'not done'}`)

  nextStep(e)
}

/** Дальше по плану; в конце прохода цикла «пока не готово» - спросить, нужен ли ещё. */
export const nextStep = (e: EngineCore): void => {
  const finished = e.step

  if (!finished) return e.end('done', '', '')

  const next = e.run.steps[e.at + 1]
  const stage = e.stageOf(finished)
  const passEnded = !next || next.stageId !== finished.stageId || next.pass !== finished.pass
  const moreToCome = next?.stageId === finished.stageId && next.pass > finished.pass

  if (stage && loopsUntilDone(stage) && passEnded && moreToCome) {
    e.phase = 'again'
    askHead(e, anotherPassRequest(stage, finished.pass, passesOf(stage)))

    return
  }

  e.at += 1

  if (e.at >= e.run.steps.length) return e.end('done', '', '')

  beginStep(e)
}

/** Ещё проход или нет; непройденные проходы - пропущены, а не стёрты: длина цикла видна. */
export const takeAnotherPass = (e: EngineCore, body: ReplyBody): void => {
  const here = e.step

  if (!here) return e.end('done', '', '')

  if (replyFlag(body, 'again') === true) {
    e.at += 1

    return e.at >= e.run.steps.length ? e.end('done', '', '') : beginStep(e)
  }

  let index = e.at + 1

  while (e.run.steps[index]?.stageId === here.stageId) {
    const key = e.run.steps[index]?.key ?? ''

    e.editStep(key, (one) => ({ ...one, state: 'skipped', finishedAt: Date.now() }))
    index += 1
  }

  e.at = index

  if (e.at >= e.run.steps.length) return e.end('done', '', '')

  beginStep(e)
}

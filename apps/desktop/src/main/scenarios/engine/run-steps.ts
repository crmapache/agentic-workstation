import { stepKeyOf } from '@shared/scenario-rules'
import type { RunItem, RunStep, ScenarioRun } from '@shared/scenario-runs'
import { isStepOver, isStepBegun, isRunFinished } from '@shared/scenario-runs'
import type { ScenarioStage } from '@shared/scenarios'
import { MAX_STAGE_ITEMS } from '@shared/scenarios'

import type { ReplyBody } from './head-reply'

/**
 * Арифметика над шагами прогона - то, где карточку делают дважды или теряют, а на экране оба
 * исхода выглядят здоровыми: список этапа «по пункту» (StageList), точка подхвата (CarryOn) и
 * часы стоянки (RunClock в ACC). Чистые функции, с тестом.
 */

/** Сколько имени пункта держать - несколько слов для строки и подсказки. */
export const LABEL_CHARS = 120

export type ListReading =
  | { kind: 'missing' }
  | { kind: 'unusable'; places: number[] }
  | { kind: 'tooLong'; count: number }
  | { kind: 'items'; items: { label: string; value: string }[] }

const labelOf = (text: string): string => {
  const line = text.trim().split(/\s+/).join(' ')

  return line.length <= LABEL_CHARS ? line : `${line.slice(0, LABEL_CHARS)}...`
}

const itemOf = (element: unknown): { label: string; value: string } | null => {
  if (typeof element === 'string' || typeof element === 'number') {
    const value = String(element).trim()

    return value ? { label: labelOf(value), value } : null
  }

  if (typeof element !== 'object' || element === null || Array.isArray(element)) return null

  const raw = element as Record<string, unknown>
  const value = typeof raw['value'] === 'string' ? raw['value'].trim() : ''
  const label = typeof raw['label'] === 'string' ? raw['label'] : ''

  return value ? { label: labelOf(label.trim() || value), value } : null
}

/** Список из ответа головы; пункт, который не прочитать, портит весь ответ (переспросят). */
export const readList = (body: ReplyBody): ListReading => {
  const array = body['items']

  if (!Array.isArray(array)) return { kind: 'missing' }

  const listed = array.map(itemOf)
  const places = listed.flatMap((item, index) => (item ? [] : [index + 1]))

  if (places.length > 0) return { kind: 'unusable', places }
  if (listed.length > MAX_STAGE_ITEMS) return { kind: 'tooLong', count: listed.length }

  return { kind: 'items', items: listed.flatMap((item) => (item ? [item] : [])) }
}

const passStep = (
  stageId: string,
  cardId: string,
  pass: number,
  title: string,
  item: RunItem | null,
): RunStep => ({
  key: stepKeyOf(stageId, cardId, pass),
  cardId,
  stageId,
  pass,
  title,
  state: 'waiting',
  conversationId: '',
  startedAt: 0,
  finishedAt: 0,
  slots: {},
  prompt: '',
  said: '',
  summary: '',
  nudges: [],
  verdict: '',
  verdictReason: '',
  handoff: '',
  failure: '',
  error: '',
  cost: 0,
  tokens: 0,
  takeOver: '',
  rested: 0,
  item,
})

/** Пустой шаг плана. */
export const plannedStep = (
  key: string,
  stageId: string,
  cardId: string,
  pass: number,
  title: string,
): RunStep => ({ ...passStep(stageId, cardId, pass, title, null), key })

/**
 * Список в шаги: заглушка этапа - по проходу на пункт, все карточки этапа в каждом. Пустой
 * список оставляет заглушку пропущенной с count 0: этап, которому нечего делать, отличается
 * от этапа, до которого не дошли.
 */
export const expandList = (
  steps: RunStep[],
  stage: ScenarioStage,
  items: { label: string; value: string }[],
  now: number,
): RunStep[] => {
  const first = steps.findIndex((step) => step.stageId === stage.id)

  if (first < 0) return steps

  let size = 0

  while (steps[first + size]?.stageId === stage.id) size += 1

  const written =
    items.length === 0
      ? steps.slice(first, first + size).map((step) => ({
          ...step,
          state: 'skipped' as const,
          startedAt: 0,
          finishedAt: now,
          item: { label: '', value: '', index: 0, count: 0, again: '' },
        }))
      : items.flatMap((listed, index) =>
          stage.cards.map((card) =>
            passStep(stage.id, card.id, index + 1, card.title.trim() || 'Untitled', {
              ...listed,
              index: index + 1,
              count: items.length,
              again: '',
            }),
          ),
        )

  return [...steps.slice(0, first), ...written, ...steps.slice(first + size)]
}

/** Можно ли ещё отложить пункт: это пункт, и это его первый заход. */
export const canPutOff = (step: RunStep | undefined): boolean =>
  Boolean(step?.item && step.item.count > 0 && !step.item.again)

/**
 * Пункт отложен: остаток его прохода пропущен, второй заход - в конец ЭТАПА, с отложенной
 * карточки до конца прохода. Сам шаг отмечает движок: суждение о нём - головы.
 */
export const putOff = (steps: RunStep[], at: number, reason: string, now: number): RunStep[] => {
  const step = steps[at]
  const item = step?.item

  if (!step || !item) return steps

  const samePass = (one: RunStep) => one.stageId === step.stageId && one.pass === step.pass
  const marked = steps.map((one, index) =>
    index > at && samePass(one) && !isStepOver(one.state)
      ? { ...one, state: 'skipped' as const, finishedAt: now }
      : one,
  )
  const pass =
    Math.max(...marked.filter((one) => one.stageId === step.stageId).map((one) => one.pass)) + 1
  const pastSame = marked.filter(samePass)
  const from = pastSame.findIndex((one) => one.key === step.key)
  const again = pastSame
    .slice(from)
    .map((one) => passStep(one.stageId, one.cardId, pass, one.title, { ...item, again: reason }))
  const end = marked.findLastIndex((one) => one.stageId === step.stageId) + 1

  return [...marked.slice(0, end), ...again, ...marked.slice(end)]
}

/** Куда идти, когда проход шага at позади: первый шаг другого прохода. */
export const afterPass = (steps: RunStep[], at: number): number => {
  const step = steps[at]

  if (!step) return steps.length

  const next = steps.findIndex(
    (one, index) => index > at && (one.stageId !== step.stageId || one.pass !== step.pass),
  )

  return next < 0 ? steps.length : next
}

/**
 * Откуда подхватить законченный прогон. Последняя сделанная карточка - последнее, что точно
 * случилось; после неё - либо одна начатая (оборванная), либо ни одной. «Первая не сделанная»
 * не годится: пропуски рано законченного цикла стоят ПЕРЕД сделанными карточками дальше.
 */
export const carryOnPoint = (run: ScenarioRun): { at: number; begun: boolean } | null => {
  if (!isRunFinished(run.state) || run.state === 'done' || !run.headConversationId) return null

  const lastDone = run.steps.findLastIndex((step) => step.state === 'done')
  const cut = run.steps.findIndex((step, index) => index > lastDone && isStepBegun(step.state))

  if (cut >= 0) return { at: cut, begun: true }

  return lastDone + 1 < run.steps.length ? { at: lastDone + 1, begun: false } : null
}

/**
 * Часы прогона идут за фазой: пауза и вопрос человеку - стоянка, остальное - работа. Стоянка
 * ложится и на карточку на доске, чтобы строка шага и общие часы не спорили о той же паузе.
 */
export const followClock = (
  run: ScenarioRun,
  resting: boolean,
  board: number,
  now: number,
): ScenarioRun => {
  if (resting) return run.restingSince === 0 ? { ...run, restingSince: now } : run
  if (run.restingSince === 0) return run

  const length = Math.max(0, now - run.restingSince)
  const onBoard = run.steps[board]
  const open = onBoard && isStepBegun(onBoard.state) && !isStepOver(onBoard.state)

  return {
    ...run,
    rested: run.rested + length,
    restingSince: 0,
    steps: open
      ? run.steps.map((step) =>
          step.key === onBoard.key ? { ...step, rested: step.rested + length } : step,
        )
      : run.steps,
  }
}

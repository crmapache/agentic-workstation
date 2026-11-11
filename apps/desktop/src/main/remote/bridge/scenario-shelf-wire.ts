import type { RunSummary } from '@shared/scenario-runs'
import type { ScenarioShelvesView } from '@shared/scenario-view'
import type { Scenario, ScenarioSchedule } from '@shared/scenarios'

import type {
  ShelvesWire,
  ScenarioWire,
  ScheduleWire,
} from '@agentic-workstation/remote-protocol/scenario-wire-types'

import type { Redact } from './fit'
import { sizeOf, fitValue, redactStrings } from './fit'
import { READ_BUDGET } from './reads-fit'
import { runSummaryWire, shelfScenarioWire } from './scenario-wire'

/**
 * Полки проекта и сценарий целиком - телефону, в один кадр. Сценарий урезается строками (длинный
 * промпт карточки - с пометкой в тексте), история прогонов - свежими: старее - «есть ещё». Пути в
 * тексте (бриф, промпт) - метками папок, как везде на проводе.
 */

type KeyOf = (rootPath: string) => string

/** Сколько прошлых прогонов уходит телефону: экран-другой истории, а не весь архив. */
export const RUN_HISTORY = 60

export const scenarioWire = (scenario: Scenario): ScenarioWire => ({
  ...shelfScenarioWire(scenario),
  updatedAt: scenario.updatedAt,
  head: {
    briefing: scenario.head.briefing,
    model: scenario.head.model,
    effort: scenario.head.effort,
    permissionMode: scenario.head.permissionMode,
    onQuestion: scenario.head.onQuestion,
    retries: scenario.head.retries,
    onGiveUp: scenario.head.onGiveUp,
  },
  stages: scenario.stages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    repeat: stage.repeat,
    untilDone: stage.untilDone,
    each: stage.each ? { name: stage.each.name, description: stage.each.description } : null,
    cards: stage.cards.map((card) => ({
      id: card.id,
      title: card.title,
      prompt: card.prompt,
      dod: card.dod,
      after: card.after,
      model: card.model,
      effort: card.effort,
      permissionMode: card.permissionMode,
      slots: card.slots.map(({ name, description }) => ({ name, description })),
    })),
  })),
})

/** Сценарий в кадр: без папок, длинные строки - короче; не влез и так - null. */
export const scenarioThatFits = (scenario: Scenario, redact: Redact): ScenarioWire | null =>
  fitValue(scenarioWire(scenario), READ_BUDGET, redact)

export const scheduleWire = (schedule: ScenarioSchedule): ScheduleWire => ({
  id: schedule.id,
  scenarioId: schedule.scenarioId,
  scope: schedule.scope,
  at: schedule.at,
  repeat: schedule.repeat,
  weekday: schedule.weekday,
  inputs: schedule.inputs,
  nextAt: schedule.nextAt,
  lastAt: schedule.lastAt,
  missedAt: schedule.missedAt,
  worktree: schedule.worktree,
  provider: schedule.provider,
})

const fresh = (runs: readonly RunSummary[]) =>
  [...runs].sort((first, second) => second.startedAt - first.startedAt).slice(0, RUN_HISTORY)

/**
 * Полки, история и расписание проекта - сколько влезло в кадр: ответы на вопросы и тексты - без
 * папок; не влезло - сначала короче история прогонов (старые уходят, moreRuns), потом строки.
 */
export const shelvesThatFit = (
  view: ScenarioShelvesView,
  keyOf: KeyOf,
  redact: Redact,
  budget = READ_BUDGET,
): ShelvesWire | null => {
  const runs = fresh(view.runs).map((run) => runSummaryWire(run, keyOf))
  const shelves = (kept: typeof runs): ShelvesWire => ({
    scenarios: view.scenarios.map(shelfScenarioWire),
    runs: kept,
    moreRuns: kept.length < view.runs.length,
    schedules: view.schedules.map(scheduleWire),
    schedulesUnread: view.schedulesUnread,
  })
  let wire = redactStrings(shelves(runs), redact) as ShelvesWire

  while ((wire.runs?.length ?? 0) > 0 && sizeOf(wire) > budget) {
    wire = { ...wire, runs: wire.runs?.slice(0, -1), moreRuns: true }
  }

  return fitValue(wire, budget)
}

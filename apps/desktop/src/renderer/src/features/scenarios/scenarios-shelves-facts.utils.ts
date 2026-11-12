import { cardRuns, passesOf, isBlocking, problemsOf } from '@shared/scenario-rules'
import type { Scenario, ScenarioSchedule } from '@shared/scenarios'

/**
 * Что строка полки говорит о сценарии (Shelf.tsx в ACC): сколько этапов и карточек, есть ли
 * цикл, о чём спросит перед стартом, сломан ли, и его часы. Словами это делает строка, здесь -
 * только факты.
 */

export type ScenarioFacts = {
  /** Запуск откажет: строка вместо счёта говорит «чинить», а Run ведёт в редактор. */
  broken: boolean
  /** Сколько бед мешает запуску. */
  problems: number
  stages: number
  /** Сколько карточек начнёт прогон, проходы посчитаны. */
  cards: number
  /** Этап с проходами больше одного (цикл); этап «по пункту» - своим чипом. */
  hasLoop: boolean
  perItem: boolean
  /** Имена вопросов перед стартом, по порядку. */
  asks: string[]
}

export const factsOf = (scenario: Scenario): ScenarioFacts => {
  const blockers = problemsOf(scenario).filter(isBlocking)

  return {
    broken: blockers.length > 0,
    problems: blockers.length,
    stages: scenario.stages.length,
    cards: cardRuns(scenario),
    hasLoop: scenario.stages.some((stage) => !stage.each && passesOf(stage) > 1),
    perItem: scenario.stages.some((stage) => Boolean(stage.each)),
    asks: scenario.inputs.map((input) => input.name.trim()).filter((name) => name.length > 0),
  }
}

/** Часы сценария одной строкой: сколько их, ближайший срок и последний пропущенный. */
export type HoursNote = { count: number; next: number | null; missed: number | null }

/**
 * Пропуск берётся только у часов, у которых ещё есть срок впереди: пометка рисуется ВМЕСТО
 * ближайшего запуска, и пропущенный разовый час навсегда прятал бы утро ежедневного. Когда
 * впереди нет ничего, пропуск - единственное, что осталось сказать.
 */
export const hoursNote = (hours: readonly ScenarioSchedule[]): HoursNote | null => {
  if (hours.length === 0) return null

  const living = hours.filter((one) => one.nextAt > 0)
  const speaking = living.length > 0 ? living : hours
  const missed = speaking.map((one) => one.missedAt).filter((at) => at > 0)

  return {
    count: hours.length,
    next: living.length > 0 ? Math.min(...living.map((one) => one.nextAt)) : null,
    missed: missed.length > 0 ? Math.max(...missed) : null,
  }
}

/** Два ближайших срока: первый - что проверяют, второй говорит, что это ритм, а не одна дата. */
export const comingHours = (hours: readonly ScenarioSchedule[]): number[] =>
  hours
    .map((one) => one.nextAt)
    .filter((at) => at > 0)
    .sort((left, right) => left - right)
    .slice(0, 2)

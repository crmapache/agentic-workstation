import type {
  RunWire,
  RunStepWire,
  ShelfScenarioWire,
} from '@agentic-workstation/remote-protocol/wire-types'

/** Сценарий на полке одной строкой: `scope:id` - id одинаков на двух полках. */
export const scenarioKey = (scenario: Pick<ShelfScenarioWire, 'scope' | 'id'>): string =>
  `${scenario.scope}:${scenario.id}`

/** Все обязательные вопросы сценария отвечены. */
export const inputsReady = (scenario: ShelfScenarioWire, inputs: Record<string, string>): boolean =>
  scenario.inputs.every((input) => !input.required || (inputs[input.id] ?? '').trim() !== '')

/** Ответы, что уходят в IDE: только на вопросы этого сценария, без пробелов по краям. */
export const answersOf = (
  scenario: ShelfScenarioWire,
  inputs: Record<string, string>,
): Record<string, string> =>
  Object.fromEntries(scenario.inputs.map((input) => [input.id, (inputs[input.id] ?? '').trim()]))

/**
 * Время работы прогона, как в IDE (runWorked): от начала до конца или до now (часы IDE), без
 * промежутков до «продолжить», пауз и вопросов человеку, и без идущей паузы. IDE старше учёта
 * пауз не шлёт их - тогда без вычетов. Прогон без startedAt (ещё не стартовал) не показывают вовсе:
 * от нуля вышли бы десятки лет.
 */
export const runWorked = (
  run: Pick<RunWire, 'startedAt' | 'finishedAt' | 'idle' | 'rested' | 'restingSince'>,
  now: number,
): number => {
  const end = run.finishedAt > 0 ? run.finishedAt : now
  const resting = run.restingSince ?? 0
  const standing = run.finishedAt === 0 && resting > 0 ? Math.max(0, now - resting) : 0

  return Math.max(0, end - run.startedAt - (run.idle ?? 0) - (run.rested ?? 0) - standing)
}

/** Время работы шага - так же, без своих стоянок и без идущей стоянки прогона; не начат - 0. */
export const stepWorked = (
  step: Pick<RunStepWire, 'startedAt' | 'finishedAt' | 'rested'>,
  now: number,
  run: Pick<RunWire, 'restingSince' | 'finishedAt'>,
): number => {
  if (step.startedAt === 0) return 0

  const open = step.finishedAt === 0
  const end = open ? now : step.finishedAt
  const resting = run.restingSince ?? 0
  const standing =
    open && run.finishedAt === 0 && resting > 0
      ? Math.max(0, now - Math.max(resting, step.startedAt))
      : 0

  return Math.max(0, end - step.startedAt - (step.rested ?? 0) - standing)
}

import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'

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

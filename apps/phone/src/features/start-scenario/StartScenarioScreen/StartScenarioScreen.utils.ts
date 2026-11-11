import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { StartForm } from './StartScenarioScreen.types'

export const scenarioKey = (scenario: ShelfScenarioWire): string =>
  `${scenario.scope}:${scenario.id}`

/** Все обязательные вопросы сценария отвечены. */
export const inputsReady = (scenario: ShelfScenarioWire, inputs: Record<string, string>): boolean =>
  scenario.inputs.every((input) => !input.required || (inputs[input.id] ?? '').trim() !== '')

/** Аргументы команды запуска из формы. Ответы - только на вопросы этого сценария. */
export const startArgs = (
  projectKey: string,
  scenario: ShelfScenarioWire,
  form: StartForm,
): CommandArgs<'scenarios.start'> => ({
  projectKey,
  scenarioId: scenario.id,
  scope: scenario.scope,
  inputs: Object.fromEntries(
    scenario.inputs.map((input) => [input.id, (form.inputs[input.id] ?? '').trim()]),
  ),
  provider: form.provider,
  target:
    form.target.kind === 'new'
      ? { kind: 'new', worktree: form.worktree }
      : { kind: 'queue', queueId: form.target.queueId },
  afterSuccess: form.target.kind === 'queue' && form.afterSuccess,
})

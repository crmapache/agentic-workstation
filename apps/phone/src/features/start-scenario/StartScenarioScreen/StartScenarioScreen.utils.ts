import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'

import { answersOf } from '../../../lib/scenarios.utils'
import type { StartForm } from './StartScenarioScreen.types'

/** Аргументы команды запуска из формы. Ответы - только на вопросы этого сценария. */
export const startArgs = (
  projectKey: string,
  scenario: ShelfScenarioWire,
  form: StartForm,
): CommandArgs<'scenarios.start'> => ({
  projectKey,
  scenarioId: scenario.id,
  scope: scenario.scope,
  inputs: answersOf(scenario, form.inputs),
  provider: form.provider,
  target:
    form.target.kind === 'new'
      ? { kind: 'new', worktree: form.worktree }
      : { kind: 'queue', queueId: form.target.queueId },
  afterSuccess: form.target.kind === 'queue' && form.afterSuccess,
})

import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'

import { answersOf } from '../../../lib/scenarios.utils'
import { atFromText } from '../../../lib/schedule.utils'
import type { ScheduleForm } from './ScheduleScreen.types'

/**
 * Аргументы нового отложенного запуска из формы (scheduleId пусто - новый); час не разобрался -
 * null, кнопка не нажимается. Ответы - только на вопросы этого сценария.
 */
export const scheduleArgs = (
  projectKey: string,
  scenario: ShelfScenarioWire,
  form: ScheduleForm,
): CommandArgs<'scenarios.schedule'> | null => {
  const at = atFromText(form.time)

  if (at === null || !form.provider) return null

  return {
    projectKey,
    scenarioId: scenario.id,
    scope: scenario.scope,
    scheduleId: '',
    at,
    repeat: form.repeat,
    weekday: form.weekday,
    inputs: answersOf(scenario, form.inputs),
    worktree: form.worktree,
    provider: form.provider,
  }
}

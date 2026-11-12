import type {
  ShelvesWire,
  ScheduleWire,
} from '@agentic-workstation/remote-protocol/scenario-wire-types'

import { scenarioKey } from '../../../lib/scenarios.utils'

/** Имя сценария отложенного запуска с полок; сценария больше нет на полке - null. */
export const scheduledName = (
  shelves: ShelvesWire,
  schedule: Pick<ScheduleWire, 'scope' | 'scenarioId'>,
): string | null =>
  shelves.scenarios.find(
    (scenario) =>
      scenarioKey(scenario) === scenarioKey({ scope: schedule.scope, id: schedule.scenarioId }),
  )?.name ?? null

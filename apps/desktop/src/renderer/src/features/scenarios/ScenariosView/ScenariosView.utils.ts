import type { ScenarioQueue } from '@shared/scenario-queues'
import type { ScenarioShelvesView } from '@shared/scenario-view'

import type { TabsItem } from '@agentic-workstation/ui/Tabs.types'

import type { ScenariosTab } from '../scenarios.types'

/**
 * Вкладки вида со счётчиками: сценарии, очереди, расписание, история - всё текущего проекта,
 * очереди тоже (ADR 0072).
 */
export const tabItems = (
  label: (tab: ScenariosTab) => string,
  queues: readonly ScenarioQueue[],
  shelves: ScenarioShelvesView | undefined,
): TabsItem<ScenariosTab>[] => [
  { id: 'library', label: label('library'), count: shelves?.scenarios.length ?? 0 },
  { id: 'queues', label: label('queues'), count: queues.length },
  { id: 'schedule', label: label('schedule'), count: shelves?.schedules.length ?? 0 },
  { id: 'history', label: label('history'), count: shelves?.runs.length ?? 0 },
]

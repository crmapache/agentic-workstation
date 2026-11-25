import type { ScenarioQueue } from '@shared/scenario-queues'
import type { ScenarioShelvesView } from '@shared/scenario-view'

import type { TabsItem } from '@agentic-workstation/ui/Tabs.types'

import type { ScenariosTab } from '../scenarios.types'

/**
 * Вкладки вида со счётчиками: очереди, расписание, история, сценарии - всё текущего проекта,
 * очереди тоже (ADR 0072). Очереди первыми и открываются первыми: в вид приходят смотреть, что
 * идёт, а библиотеку сценариев правят реже - она последней (просьба владельца).
 */
export const tabItems = (
  label: (tab: ScenariosTab) => string,
  queues: readonly ScenarioQueue[],
  shelves: ScenarioShelvesView | undefined,
): TabsItem<ScenariosTab>[] => [
  { id: 'queues', label: label('queues'), count: queues.length },
  { id: 'schedule', label: label('schedule'), count: shelves?.schedules.length ?? 0 },
  { id: 'history', label: label('history'), count: shelves?.runs.length ?? 0 },
  { id: 'library', label: label('library'), count: shelves?.scenarios.length ?? 0 },
]

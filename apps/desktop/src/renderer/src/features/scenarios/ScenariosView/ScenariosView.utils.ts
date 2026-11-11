import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { ScenarioShelvesView } from '@shared/scenario-view'

import type { TabsItem } from '@agentic-workstation/ui/Tabs.types'

import type { ScenariosTab } from '../scenarios.types'

/** Вкладки вида со счётчиками: очереди проекта, все очереди, сценарии, расписание, история. */
export const tabItems = (
  label: (tab: ScenariosTab) => string,
  projectPath: string,
  queues: ScenarioQueuesView | undefined,
  shelves: ScenarioShelvesView | undefined,
): TabsItem<ScenariosTab>[] => {
  const open = queues?.queues ?? []

  return [
    {
      id: 'queues',
      label: label('queues'),
      count: open.filter((queue) => queue.projectPath === projectPath).length,
    },
    { id: 'board', label: label('board'), count: open.length },
    { id: 'library', label: label('library'), count: shelves?.scenarios.length ?? 0 },
    { id: 'schedule', label: label('schedule'), count: shelves?.schedules.length ?? 0 },
    { id: 'history', label: label('history'), count: shelves?.runs.length ?? 0 },
  ]
}

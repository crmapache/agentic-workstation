import type { ScenariosProject } from '../ScenariosView.types'
import type { ScenariosTab } from '../../scenarios.types'
import { HistoryTab } from '../../HistoryTab/HistoryTab'
import { LibraryTab } from '../../LibraryTab/LibraryTab'
import { QueuesTab } from '../../QueuesTab/QueuesTab'
import { ScheduleTab } from '../../ScheduleTab/ScheduleTab'

/** Содержимое выбранной вкладки вида сценариев. */
export const ScenariosTabBody = ({
  tab,
  project,
}: {
  tab: ScenariosTab
  project: ScenariosProject
}) => {
  switch (tab) {
    case 'queues':
      return <QueuesTab project={project} />
    case 'library':
      return <LibraryTab project={project} />
    case 'schedule':
      return <ScheduleTab project={project} />
    case 'history':
      return <HistoryTab project={project} />
  }
}

import type { BoardGroup } from '../scenarios-queues.utils'
import { useScenariosStore } from '../scenarios.store'
import { useWorkspaceActions } from '../../../state/workspace.queries'

/**
 * Перейти с доски к очередям проекта: открытый - сделать текущим, закрытый (его очередь
 * пережила вкладку) - открыть заново по пути. Вкладка вида - «Queues»: там полоса целиком.
 */
export const useGoToProject = () => {
  const { activateProject, openRecentProject } = useWorkspaceActions()
  const setTab = useScenariosStore((state) => state.setTab)

  return (group: Pick<BoardGroup, 'projectId' | 'projectPath'>) => {
    if (group.projectId) activateProject(group.projectId)
    else openRecentProject(group.projectPath)

    setTab('queues')
  }
}

import type { QueueGroup } from '../scenarios-queues.utils'
import { useWorkspaceActions } from '../../../state/workspace.queries'

/**
 * Перейти к очередям другого проекта: открытый - сделать текущим, закрытый (его очередь
 * пережила вкладку) - открыть заново по пути. Вкладка та же: его очереди встают наверх полосами.
 */
export const useGoToProject = () => {
  const { activateProject, openRecentProject } = useWorkspaceActions()

  return (group: Pick<QueueGroup, 'projectId' | 'projectPath'>) => {
    if (group.projectId) activateProject(group.projectId)
    else openRecentProject(group.projectPath)
  }
}

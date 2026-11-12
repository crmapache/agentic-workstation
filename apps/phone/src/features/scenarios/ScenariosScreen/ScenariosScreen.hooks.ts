import type { RouteOf } from '../../../lib/route.types'
import { useCommand } from '../../../state/commands.hooks'
import { queryKeys } from '../../../state/query-keys'
import { useShelves, useInventory } from '../../../state/remote.queries'

/**
 * Полки проекта и команды над тем, что на них: убрать отложенный запуск, отметить прогон
 * звездой, удалить прогон. Зеркалом IDE полки не шлёт - после команды они перечитываются.
 */
export const useScenariosScreen = (route: RouteOf<'scenarios'>) => {
  const { agentId, projectKey } = route
  const shelves = useShelves(agentId, projectKey)
  const inventory = useInventory(agentId).data
  const invalidates = queryKeys.shelves(agentId, projectKey)
  const unschedule = useCommand(agentId, 'scenarios.unschedule', { invalidates })
  const star = useCommand(agentId, 'scenarios.starRun', { invalidates })
  const deleteRun = useCommand(agentId, 'scenarios.deleteRun', { invalidates })

  return {
    shelves,
    inventory,
    project: inventory?.projects.find((one) => one.key === projectKey),
    offset: inventory ? inventory.at - inventory.receivedAt : 0,
    busy: unschedule.isPending || star.isPending || deleteRun.isPending,
    handleUnschedule: (scheduleId: string) => unschedule.mutate({ projectKey, scheduleId }),
    handleStar: (runId: string, starred: boolean) => star.mutate({ projectKey, runId, starred }),
    handleDeleteRun: (runId: string) => deleteRun.mutate({ projectKey, runId }),
  }
}

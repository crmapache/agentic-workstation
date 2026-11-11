import { useTranslation } from 'react-i18next'

import type { RouteOf } from '../../../lib/route.types'
import { useRouter } from '../../../lib/router.store'
import { useCommand } from '../../../state/commands.hooks'
import { queryKeys } from '../../../state/query-keys'
import { useScenario } from '../../../state/scenario.queries'
import { useToastStore } from '../../../state/toast.store'

/**
 * Сценарий с полки на чтение и что с ним можно сделать с телефона: запустить, поставить на час,
 * сделать копию, удалить. Копия и удаление меняют полки - они перечитываются.
 */
export const useScenarioScreen = (route: RouteOf<'scenario'>) => {
  const { t } = useTranslation()
  const { agentId, projectKey, scope, scenarioId } = route
  const navigate = useRouter((state) => state.navigate)
  const back = useRouter((state) => state.back)
  const show = useToastStore((state) => state.show)
  const scenario = useScenario(agentId, { projectKey, scope, scenarioId })
  const invalidates = queryKeys.shelves(agentId, projectKey)
  const duplicate = useCommand(agentId, 'scenarios.duplicate', { invalidates })
  const remove = useCommand(agentId, 'scenarios.delete', { invalidates })
  const ref = { projectKey, scope, scenarioId }

  const handleDuplicate = () =>
    duplicate.mutate(ref, { onSuccess: () => show(t('scenario.duplicated'), undefined, 'neutral') })

  const handleDelete = () => remove.mutate(ref, { onSuccess: back })

  const handleStart = () =>
    navigate({ name: 'startScenario', agentId, projectKey, scenario: `${scope}:${scenarioId}` })

  const handleSchedule = () =>
    navigate({ name: 'schedule', agentId, projectKey, scope, scenarioId })

  return {
    scenario,
    busy: duplicate.isPending || remove.isPending,
    handleDuplicate,
    handleDelete,
    handleStart,
    handleSchedule,
  }
}

import type { TrackerScenario } from '@shared/tracker'

import { useScenarioShelves } from '../../state/scenarios.queries'
import { useActiveProject } from '../../state/workspace.queries'

/** Сценарии открытого проекта с обеих полок: выбор для карточки и имя на её метке. */
export const useShelfScenarios = () => {
  const project = useActiveProject()
  const { data } = useScenarioShelves(project?.id ?? null)

  return data?.scenarios ?? []
}

/** Имя сценария карточки; сценария нет на полке - его id, чтобы метка не пропала. */
export const useScenarioName = (binding: TrackerScenario | null): string => {
  const scenarios = useShelfScenarios()

  if (!binding) return ''

  return (
    scenarios.find((one) => one.id === binding.scenarioId && one.scope === binding.scope)?.name ??
    binding.scenarioId
  )
}

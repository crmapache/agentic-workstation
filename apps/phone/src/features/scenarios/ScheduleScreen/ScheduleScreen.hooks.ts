import { useState } from 'react'

import { defaultUnattendedProvider } from '../../../lib/options.utils'
import type { RouteOf } from '../../../lib/route.types'
import { navigateFromHere } from '../../../lib/router.store'
import { inputsReady, scenarioKey } from '../../../lib/scenarios.utils'
import { useCommand } from '../../../state/commands.hooks'
import { queryKeys } from '../../../state/query-keys'
import { useShelves, useInventory } from '../../../state/remote.queries'
import { DEFAULT_SCHEDULE } from './ScheduleScreen.constants'
import type { ScheduleForm } from './ScheduleScreen.types'
import { scheduleArgs } from './ScheduleScreen.utils'

/**
 * Новый отложенный запуск сценария: вопросы сценария - с полок, провайдеры - из инвентаря IDE.
 * Поставили - назад к полкам: там его видно в расписании.
 */
export const useScheduleScreen = (route: RouteOf<'schedule'>) => {
  const { agentId, projectKey, scope, scenarioId } = route
  const shelves = useShelves(agentId, projectKey)
  const inventory = useInventory(agentId).data
  const schedule = useCommand(agentId, 'scenarios.schedule', {
    invalidates: queryKeys.shelves(agentId, projectKey),
  })
  const [form, setForm] = useState<ScheduleForm>(DEFAULT_SCHEDULE)
  const scenario = shelves.data?.scenarios.find(
    (one) => scenarioKey(one) === scenarioKey({ scope, id: scenarioId }),
  )
  const providers = inventory?.providers ?? []
  // Пока человек не выбрал - первый, кто возьмёт работу без человека (не только для чата).
  const provider = form.provider || defaultUnattendedProvider(providers)
  const args = scenario ? scheduleArgs(projectKey, scenario, { ...form, provider }) : null

  const update = (patch: Partial<ScheduleForm>) => setForm((current) => ({ ...current, ...patch }))

  const handleSubmit = async () => {
    if (!args) return

    const navigate = navigateFromHere()
    const done = await schedule
      .mutateAsync(args)
      .then(() => true)
      .catch(() => false)

    if (done) navigate({ name: 'scenarios', agentId, projectKey }, { replace: true })
  }

  return {
    shelves,
    scenario,
    form,
    update,
    providers,
    provider,
    canSubmit: !!args && !!scenario && inputsReady(scenario, form.inputs) && !schedule.isPending,
    handleSubmit,
  }
}

import { useState } from 'react'

import type { RouteOf } from '../../../lib/route.types'
import { useRouter } from '../../../lib/router.store'
import { useCommand } from '../../../state/commands.hooks'
import { useWatch, useQueues, useShelves, useInventory } from '../../../state/remote.queries'
import type { StartForm } from './StartScenarioScreen.types'
import { startArgs, inputsReady, scenarioKey } from './StartScenarioScreen.utils'

/** Запуск сценария: полки проекта, открытые очереди, провайдеры и сама команда. */
export const useStartScenario = (route: RouteOf<'startScenario'>) => {
  const { agentId, projectKey } = route
  const navigate = useRouter((state) => state.navigate)
  const shelves = useShelves(agentId, projectKey)
  const queues = useQueues(agentId, projectKey).data
  const inventory = useInventory(agentId).data
  const start = useCommand(agentId, 'scenarios.start')
  const providers = inventory?.providers.filter((one) => one.available) ?? []
  const [form, setForm] = useState<StartForm>({
    scenario: '',
    inputs: {},
    target: { kind: 'new' },
    worktree: true,
    afterSuccess: false,
    provider: '',
  })
  const scenario = shelves.data?.find((one) => scenarioKey(one) === form.scenario)
  const provider = form.provider || providers[0]?.id || ''
  const openQueues = queues?.queues.filter((queue) => queue.closedAt === 0) ?? []

  useWatch(agentId, { kind: 'queues', scope: projectKey })

  const update = (patch: Partial<StartForm>) => setForm((current) => ({ ...current, ...patch }))

  const handleStart = async () => {
    if (!scenario || !provider) return

    const data = (await start
      .mutateAsync(startArgs(projectKey, scenario, { ...form, provider }))
      .catch(() => null)) as { queueId?: string } | null

    if (data?.queueId) {
      navigate({ name: 'queue', agentId, projectKey, queueId: data.queueId }, { replace: true })
    }
  }

  return {
    shelves,
    form,
    update,
    scenario,
    providers,
    provider,
    openQueues,
    canStart: !!scenario && !!provider && inputsReady(scenario, form.inputs) && !start.isPending,
    handleStart,
  }
}

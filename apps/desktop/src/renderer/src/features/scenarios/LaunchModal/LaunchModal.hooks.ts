import { useState } from 'react'

import type { ProviderId } from '@shared/providers'
import { answersOf, isRunnable, missingInputs } from '@shared/scenario-rules'
import type { Scenario } from '@shared/scenarios'
import { useMutation } from '@tanstack/react-query'

import { folderNeighbours } from '../scenarios-queues.utils'
import { useScenariosStore } from '../scenarios.store'
import type { ScenariosProject } from '../ScenariosView/ScenariosView.types'
import { invoke } from '../../../lib/ipc'
import { useGitChanges } from '../../../state/git-changes.queries'
import {
  useProviders,
  useScenarioQueues,
  useScenarioShelves,
} from '../../../state/scenarios.queries'
import type { StartRequest, LaunchRequest } from './LaunchModal.types'
import {
  initialPick,
  currentWhere,
  findScenario,
  initialWhere,
  launchFailure,
  defaultProvider,
  uncommittedCount,
} from './LaunchModal.utils'

/**
 * Состояние окна запуска: что выбрано (сценарий, ответы, провайдер, куда, worktree, «после
 * успеха») и что из этого следует (можно ли запускать, о чём предупредить). Черновик формы -
 * здесь, данные главного процесса - из кэша. Запуск встал - окно закрывается на вкладку очередей,
 * нет - причина остаётся в окне: человек поправит и запустит снова.
 */
export const useLaunchForm = (project: ScenariosProject, request: LaunchRequest) => {
  const close = useScenariosStore((state) => state.close)
  const setTab = useScenariosStore((state) => state.setTab)
  const shelves = useScenarioShelves(project.id)
  const { data: providers = [] } = useProviders()
  const { data: view } = useScenarioQueues()
  const changes = useGitChanges(project.id)
  const [pick, setPick] = useState(() => initialPick(request))
  const [values, setValues] = useState<Record<string, string>>({})
  const [providerId, setProviderId] = useState<ProviderId | null>(null)
  const [where, setWhere] = useState(() => initialWhere(request))
  const [isWorktree, setIsWorktree] = useState(false)
  const [afterSuccess, setAfterSuccess] = useState(true)
  const start = useMutation({
    mutationFn: (next: StartRequest) => invoke('scenarios:start', next),
    onSuccess: (outcome) => {
      if (!outcome.ok) return

      close()
      setTab('queues')
    },
  })

  const scenarios = shelves.data?.scenarios ?? []
  const scenario = findScenario(scenarios, pick)
  const queues = (view?.queues ?? []).filter((queue) => queue.projectPath === project.rootPath)
  const target = currentWhere(where, queues)
  const provider = providers.find((one) => one.id === providerId) ?? defaultProvider(providers)
  const isBroken = scenario !== null && !isRunnable(scenario)
  const isNotGit = changes?.kind === 'notGit'
  // Папка не в git - worktree не из чего делать: галочка гаснет, а не обещает невозможное.
  const worktree = isWorktree && !isNotGit
  const neighbour =
    target.kind === 'new' && !worktree
      ? (folderNeighbours(view?.queues ?? [], project.rootPath)[0] ?? null)
      : null
  const isMissing = scenario !== null && missingInputs(scenario, values).length > 0
  const canRun =
    scenario !== null && !isBroken && !isMissing && provider?.available === true && !start.isPending

  const choose = (next: Scenario) => {
    setPick({ id: next.id, scope: next.scope })
    // Ответы прошлого сценария к новому не подходят: у него свои вопросы.
    setValues({})
    start.reset()
  }

  const setValue = (name: string, value: string) =>
    setValues((previous) => ({ ...previous, [name]: value }))

  const submit = () => {
    if (!canRun || !scenario || !provider) return

    start.mutate({
      projectId: project.id,
      scenarioId: scenario.id,
      scope: scenario.scope,
      inputs: answersOf(scenario, values),
      provider: provider.id,
      target: target.kind === 'new' ? { kind: 'new', worktree } : target,
      // Первому в новой очереди ждать некого.
      afterSuccess: target.kind === 'new' || afterSuccess,
    })
  }

  return {
    isReading: shelves.isPending,
    scenarios,
    scenario,
    isBroken,
    values,
    providers,
    provider,
    queues,
    live: view?.live ?? [],
    target,
    worktree,
    isNotGit,
    uncommitted: uncommittedCount(changes),
    neighbour,
    afterSuccess,
    canRun,
    failure: launchFailure(start.data, start.isError),
    choose,
    setValue,
    setProviderId,
    setWhere,
    setIsWorktree,
    setAfterSuccess,
    submit,
    close,
  }
}

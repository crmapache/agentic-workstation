import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import type { QueueWorkdir, ScenarioQueue } from '@shared/scenario-queues'

import type { QueueStatus } from '../scenarios-queues.utils'
import { useScenariosStore } from '../scenarios.store'
import { useProviders } from '../../../state/scenarios.queries'
import { PROVIDER_LIST } from './QueueCard.constants'

/**
 * Текущее время, пока часы идут: показание прогона - в секундах, поэтому шаг CLOCK_TICK_MS.
 * Стоящий прогон часы не двигает, и окно не перерисовывается зря.
 */
export const useClock = (isTicking: boolean, interval: number): number => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isTicking) return

    const tick = () => setNow(Date.now())
    // Первое показание сразу: иначе секунду висело бы время, когда часы стояли.
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, interval)

    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [isTicking, interval])

  return now
}

/** Провайдеры элементов очереди словами: «Claude Code». Имя - от главного процесса, как в окне запуска. */
export const useProviderLabel = (queue: ScenarioQueue): string => {
  const { data } = useProviders()
  const ids = [...new Set(queue.items.map((item) => item.provider))]

  return PROVIDER_LIST.format(ids.map((id) => data?.find((one) => one.id === id)?.label ?? id))
}

/** Состояние очереди словом - одно для полосы, плотной карточки и выбора очереди в окне запуска. */
export const useStatusWord = () => {
  const { t } = useTranslation()

  return (status: QueueStatus): string =>
    status.kind === 'held'
      ? t(`scenarios.queues.status.held.${status.reason}`)
      : t(`scenarios.queues.status.${status.kind}`)
}

/** Где очередь работает словом: папка проекта, worktree с его веткой или удалённый worktree. */
export const useWorkdirWord = () => {
  const { t } = useTranslation()

  return (workdir: QueueWorkdir): string => {
    if (workdir.kind === 'project') return t('scenarios.queues.workdir.project')

    return workdir.removed
      ? t('scenarios.queues.workdir.removed')
      : t('scenarios.queues.workdir.worktree', { branch: workdir.gitBranch })
  }
}

/** Прогон элемента очереди - окном по центру; ищется по очереди: она может быть чужого проекта. */
export const useOpenRun = (queueId: string) => {
  const open = useScenariosStore((state) => state.open)

  return (runId: string) => open({ kind: 'run', place: { queueId }, runId })
}

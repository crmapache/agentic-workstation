import type { TaskDraft, TaskSaved, TaskOutcome, TaskStarted } from '@shared/tasks'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { PROVIDER_VIEW_OF } from '../../state/layout.constants'
import { useLayoutStore } from '../../state/layout.store'
import { QUERY_KEYS } from '../../state/query-keys'
import { useTaskRunStore } from '../../state/task-run.store'
import { runProviderOf } from '../../state/tasks.queries'
import { useTasksStore } from './tasks.store'

/**
 * Действия с заданиями: сохранить, удалить, включить, пропустить срок, запустить, остановить,
 * сказать прогону, открыть его разговор вкладкой панели. Новое состояние - в кэш, отказ - в угол окна.
 */
export const useTaskActions = () => {
  const queryClient = useQueryClient()
  const fail = useTasksStore((state) => state.fail)

  const took = (outcome: TaskOutcome | TaskSaved | TaskStarted): boolean => {
    if (!outcome.ok) {
      fail(outcome.code)

      return false
    }

    queryClient.setQueryData(QUERY_KEYS.tasks, outcome.state)

    return true
  }

  const save = async (task: TaskDraft) => took(await invoke('tasks:save', { task }))

  const remove = async (taskId: string) => took(await invoke('tasks:remove', { taskId }))

  const setEnabled = async (taskId: string, enabled: boolean) =>
    took(await invoke('tasks:setEnabled', { taskId, enabled }))

  /** Пропустить ближайший срок по расписанию или вернуть его. */
  const skipNext = async (taskId: string, skip: boolean) =>
    took(await invoke('tasks:skipNext', { taskId, skip }))

  /** Запустить сейчас и сразу показать прогон. */
  const runNow = async (taskId: string) => {
    const started = await invoke('tasks:runNow', { taskId })

    if (took(started) && started.ok) useTaskRunStore.getState().open(started.runId)
  }

  const stop = async (runId: string) => took(await invoke('tasks:stop', { runId }))

  const tell = async (runId: string, text: string) =>
    took(await invoke('tasks:tell', { runId, text }))

  /** Разбудить спящее поручение сейчас (ADR 0080). */
  const wake = async (runId: string) => took(await invoke('tasks:wake', { runId }))

  /** Разговор прогона - вкладкой панели его проекта; окно прогона закрывается. */
  const openChat = async (runId: string) => {
    if (!took(await invoke('tasks:openChat', { runId }))) return

    useTaskRunStore.getState().close()
    useLayoutStore.getState().showProviderView(PROVIDER_VIEW_OF[runProviderOf(queryClient, runId)])
  }

  return { save, remove, setEnabled, skipNext, runNow, stop, tell, wake, openChat }
}

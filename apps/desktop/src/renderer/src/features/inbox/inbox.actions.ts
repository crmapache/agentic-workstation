import type { QuestionAnswers } from '@shared/claude'
import type { InboxItem, InboxAction, InboxOutcome, InboxReminderRequest } from '@shared/inbox'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useInboxUiStore } from '../../state/inbox-ui.store'
import { useLayoutStore } from '../../state/layout.store'
import { QUERY_KEYS } from '../../state/query-keys'
import { useTaskRunStore } from '../../state/task-run.store'
import { useInboxStore } from './inbox.store'

/**
 * Действия с уведомлениями: нажатие кнопки, закрытие, прочитано, напоминание. Ответ главного
 * процесса кладётся в кэш, отказ - в угол окна. Куда вести окно после кнопки (прогон, разговор
 * в панели), решается здесь: главный процесс про раскладку окна не знает.
 */
export const useInboxActions = () => {
  const queryClient = useQueryClient()
  const fail = useInboxStore((state) => state.fail)
  const dropToast = useInboxUiStore((state) => state.dropToast)

  const took = (outcome: InboxOutcome): boolean => {
    if (!outcome.ok) {
      fail(outcome.code)

      return false
    }

    queryClient.setQueryData(QUERY_KEYS.inbox, outcome.state)

    return true
  }

  const act = async (
    item: InboxItem,
    action: InboxAction,
    text = '',
    answers: QuestionAnswers | null = null,
  ): Promise<boolean> => {
    // Прогон открывается сразу, не дожидаясь главного процесса: ему - только «прочитано».
    if (action.kind === 'showRun' && item.origin.kind === 'task') {
      useTaskRunStore.getState().open(item.origin.runId)
      useLayoutStore.getState().showMainView('tasks')
    }

    const ok = took(
      await invoke('inbox:act', { itemId: item.id, actionId: action.id, text, answers }),
    )

    if (ok) dropToast(item.id)
    if (ok && action.kind === 'openChat') useLayoutStore.getState().showProviderView('claude-code')

    return ok
  }

  const dismiss = async (itemIds: string[]) => {
    for (const id of itemIds) dropToast(id)

    took(await invoke('inbox:dismiss', { itemIds }))
  }

  const markRead = async (itemIds: string[]) => {
    if (itemIds.length === 0) return

    queryClient.setQueryData(QUERY_KEYS.inbox, await invoke('inbox:markRead', { itemIds }))
  }

  const clearDone = async () => {
    queryClient.setQueryData(QUERY_KEYS.inbox, await invoke('inbox:clearDone'))
  }

  const remind = async (request: InboxReminderRequest) =>
    took(await invoke('inbox:remind', request))

  return { act, dismiss, markRead, clearDone, remind }
}

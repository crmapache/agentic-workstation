import type { QuestionAnswers } from '@shared/conversation'
import type { InboxItem, InboxAction, InboxOutcome, InboxReminderRequest } from '@shared/inbox'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useInboxUiStore } from '../../state/inbox-ui.store'
import { PROVIDER_VIEW_OF } from '../../state/layout.constants'
import { useLayoutStore } from '../../state/layout.store'
import { QUERY_KEYS } from '../../state/query-keys'
import { useTaskRunStore } from '../../state/task-run.store'
import { runProviderOf } from '../../state/tasks.queries'
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

    // Накладка звонков (ADR 0114): календарь общий - открывается сразу, без проекта.
    if (action.kind === 'showCalendar' || action.kind === 'syncCalendar') {
      useLayoutStore.getState().showMainView('calendar')
    }

    const ok = took(
      await invoke('inbox:act', { itemId: item.id, actionId: action.id, text, answers }),
    )

    if (ok) dropToast(item.id)
    if (ok && action.kind === 'openChat') {
      const provider =
        item.origin.kind === 'task'
          ? runProviderOf(queryClient, item.origin.runId)
          : item.origin.kind === 'chat'
            ? item.origin.provider
            : 'claude'

      useLayoutStore.getState().showProviderView(PROVIDER_VIEW_OF[provider])
    }

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

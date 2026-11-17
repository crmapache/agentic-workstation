import { useEffect } from 'react'

import type { InboxItem } from '@shared/inbox'
import { isInboxAsking } from '@shared/inbox'

import { TOAST_HIDE_MS } from '../inbox.constants'
import { useInboxUiStore } from '../../../state/inbox-ui.store'

/**
 * Карточка в углу уходит сама, если ответа не ждут (отчёт, сообщение): всё есть на виде
 * уведомлений. Вопрос прогона стоит, пока на него не ответили или его не закрыли.
 */
export const useToastTimer = (item: InboxItem) => {
  const dropToast = useInboxUiStore((state) => state.dropToast)
  const stays = isInboxAsking(item) || item.tone === 'attention'

  useEffect(() => {
    if (stays) return

    const timer = window.setTimeout(() => dropToast(item.id), TOAST_HIDE_MS)

    return () => window.clearTimeout(timer)
  }, [stays, item.id, dropToast])
}

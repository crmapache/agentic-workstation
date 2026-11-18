import { useEffect } from 'react'

import type { InboxItem } from '@shared/inbox'

import { useInboxActions } from '../inbox.actions'
import { REVEAL_MS, READ_AFTER_MS } from '../inbox.constants'
import { useInboxStore } from '../inbox.store'
import { useInboxUiStore } from '../../../state/inbox-ui.store'
import { useLayoutStore } from '../../../state/layout.store'

/**
 * Открытые на виде уведомления становятся прочитанными, пока вид на экране, - не сразу, а
 * побыв на виду: число на иконке гаснет за тем, что человек правда видел.
 */
export const useMarkRead = (items: readonly InboxItem[]) => {
  const { markRead } = useInboxActions()
  const shown = useLayoutStore((state) => state.main.isOpen && state.main.activeViewId === 'inbox')
  const unread = items.filter((item) => item.readAt === 0).map((item) => item.id)
  const key = unread.join(' ')

  useEffect(() => {
    if (!shown || !key) return

    const timer = window.setTimeout(() => void markRead(key.split(' ')), READ_AFTER_MS)

    return () => window.clearTimeout(timer)
  }, [shown, key, markRead])
}

/**
 * Баннер ОС или карточка в углу окна привели к уведомлению: его вкладка, карточка раскрыта,
 * прокрутка к её началу и подсветка на миг. Что подсвечено, отдаёт хук; null - ничего.
 */
export const useRevealed = (items: readonly InboxItem[]): string | null => {
  const revealed = useInboxUiStore((state) => state.revealed)
  const clearReveal = useInboxUiStore((state) => state.clearReveal)
  const setTab = useInboxStore((state) => state.setTab)
  const setExpanded = useInboxStore((state) => state.setExpanded)
  const isOpened = useInboxStore((state) => revealed !== null && state.expanded[revealed] === true)
  const target = items.find((item) => item.id === revealed)
  const isListed = Boolean(target)

  // Привели к сути - свёрнутая показала бы одну шапку.
  useEffect(() => {
    if (revealed) setExpanded(revealed, true)
  }, [revealed, setExpanded])

  // Прокрутка - когда карточка уже раскрыта и стоит в списке своей вкладки: раскрытая длиннее, и к
  // началу, а не к середине - иначе шапка длинного отчёта уезжала бы за верх.
  useEffect(() => {
    if (!revealed || !isOpened || !isListed) return

    const found = document.querySelector(`[data-inbox-item="${CSS.escape(revealed)}"]`)

    found?.scrollIntoView({ block: 'start' })

    const timer = window.setTimeout(clearReveal, REVEAL_MS)

    return () => window.clearTimeout(timer)
  }, [revealed, isOpened, isListed, clearReveal])

  useEffect(() => {
    if (revealed && !target) setTab('open')
  }, [revealed, target, setTab])

  return revealed
}

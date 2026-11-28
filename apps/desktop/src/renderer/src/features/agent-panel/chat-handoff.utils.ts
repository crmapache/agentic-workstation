import type { Conversation } from '@shared/conversation'
import { isBlankChat } from '@shared/conversation'

import type { ChatHandoff } from '../../state/chat-handoff.store'

/**
 * Что панель делает с ждущими её кусками: ждать вкладку, завести новый разговор или положить
 * куски в поле активной вкладки.
 */
export type HandoffStep =
  { kind: 'wait' } | { kind: 'create' } | { kind: 'insert'; handoffs: ChatHandoff[] }

type HandoffPanel = {
  /** Активная вкладка проекта; null - вкладки нет. */
  active: Conversation | null
  /** Поле активной вкладки пустое: ни слова, ни вложения. */
  isFieldEmpty: boolean
  /** Человек сам закрыл последнюю вкладку - стоит «Let's start», сама панель вкладку не заведёт. */
  emptied: boolean
}

/**
 * Куски по порядку передачи. Кусок «в новый чат» (fresh, «Implement» у карточки) кладётся один,
 * в пустую вкладку с пустым полем - иначе сначала заводится разговор; следующий такой кусок,
 * найдя поле уже занятым, заведёт свой. Остальные - в активную вкладку, как есть. Вкладки нет, а
 * панель заводит её сама (useEnsureConversation), - ждать её: второй разговор встал бы рядом.
 */
export const handoffStep = (mine: readonly ChatHandoff[], panel: HandoffPanel): HandoffStep => {
  const { active, isFieldEmpty, emptied } = panel
  const fresh = mine.find((handoff) => handoff.fresh)

  if (mine.length === 0 || (!active && !emptied)) return { kind: 'wait' }
  if (fresh) {
    return active && isBlankChat(active) && isFieldEmpty
      ? { kind: 'insert', handoffs: [fresh] }
      : { kind: 'create' }
  }

  return active ? { kind: 'insert', handoffs: [...mine] } : { kind: 'wait' }
}

import { create } from 'zustand'

import type { DraftChip } from '@shared/message-draft'

/**
 * Бросок в поле чата ИИ жестом самой IDE (карточка с доски трекера, ADR 0127). Такой жест идёт
 * событиями мыши, а не системным переносом, и поле его не слышит. Поле на экране помечает себя
 * атрибутом и говорит, что сделать с брошенным; жест ищет поле под рукой, подсвечивает его и
 * отдаёт чип. Поле выбирается тем, что под рукой, а не провайдером и вкладкой: человек видит,
 * куда бросает.
 */

/** Атрибут поля, куда можно бросить; значение - id поля. */
export const CHAT_DROP_ATTRIBUTE = 'data-chat-drop'

type ChatDropStore = {
  /** Поле, над которым сейчас несут; null - ни над каким. */
  over: string | null
  setOver: (zone: string | null) => void
}

export const useChatDropStore = create<ChatDropStore>()((set, get) => ({
  over: null,
  // Жест зовёт это каждым кадром: то же значение никого не будит.
  setOver: (over) => {
    if (get().over !== over) set({ over })
  },
}))

const zones = new Map<string, (chip: DraftChip) => void>()

/** Поле на экране принимает брошенное; возвращает отписку. */
export const registerChatDrop = (zone: string, take: (chip: DraftChip) => void): (() => void) => {
  zones.set(zone, take)

  return () => {
    if (zones.get(zone) === take) zones.delete(zone)
  }
}

/**
 * Поле чата под точкой окна: его id или null. Призрак несомого под рукой не мешает - он
 * pointer-events: none.
 */
export const chatDropAt = (x: number, y: number): string | null =>
  document
    .elementFromPoint(x, y)
    ?.closest(`[${CHAT_DROP_ATTRIBUTE}]`)
    ?.getAttribute(CHAT_DROP_ATTRIBUTE) ?? null

/** Чип в поле. Поле успело уйти с экрана (сменилась вкладка) - бросок ничего не делает. */
export const dropIntoChat = (zone: string, chip: DraftChip): void => {
  zones.get(zone)?.(chip)
}

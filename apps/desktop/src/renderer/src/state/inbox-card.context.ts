import type { ComponentType } from 'react'
import { useContext, createContext } from 'react'

import type { InboxItem } from '@shared/inbox'

/** Карточка уведомления с кнопками ответа - та же, что на виде уведомлений. */
export type InboxCardSlot = ComponentType<{ item: InboxItem }>

/**
 * Окно прогона задания показывает вопрос, на котором прогон стоит, той же карточкой, что вид
 * уведомлений (ADR 0069): отвечают на месте. Фичи друг друга не видят - карточку кладёт сюда
 * workbench, как ленту разговора (conversation-log.context.ts).
 */
export const InboxCardContext = createContext<InboxCardSlot | null>(null)

/** Карточка уведомления; null - окно без раскладки (витрина, тест). */
export const useInboxCard = () => useContext(InboxCardContext)

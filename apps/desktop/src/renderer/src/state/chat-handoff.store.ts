import { create } from 'zustand'

import type { DraftChip } from '@shared/message-draft'
import type { ProviderId } from '@shared/providers'

/**
 * Кусок для чата провайдера ИИ: чей проект, чип, который встанет в поле, и чья панель его
 * возьмёт - названного провайдера («Implement» у карточки трекера) или любая видная («Send to
 * Chat» в редакторе: кусок идёт в тот чат, что открыт). fresh - кусок начинает свой разговор
 * (карточка - новая работа): ляжет в пустую вкладку или в новую, а не к чужому разговору.
 */
export type ChatHandoff = {
  projectId: string
  chip: DraftChip
  provider?: ProviderId | undefined
  fresh?: boolean | undefined
}

type ChatHandoffStore = {
  /** Куски по порядку: второй, отправленный до появления разговора, не стирает первый. */
  pending: readonly ChatHandoff[]
  /** Передать кусок; панель провайдера возьмёт его, как только окажется на экране. */
  hand: (handoff: ChatHandoff) => void
  /**
   * Взять эти куски: панель кладёт их в поле, и они больше не ждут. Возвращает те, что ещё ждали,
   * - двойной вызов эффекта не положит кусок дважды.
   */
  take: (handoffs: readonly ChatHandoff[]) => ChatHandoff[]
}

/** Куски, которые ждут панель этого провайдера в этом проекте, по порядку передачи. */
export const handoffsFor = (
  pending: readonly ChatHandoff[],
  projectId: string,
  provider: ProviderId,
): ChatHandoff[] =>
  pending.filter(
    (handoff) =>
      handoff.projectId === projectId && (!handoff.provider || handoff.provider === provider),
  )

/**
 * Передача из других частей окна в чат провайдера ИИ («Send to Chat» в меню редактора,
 * «Implement» у карточки трекера). Отдающий не знает, смонтирована ли панель: он кладёт кусок
 * сюда и показывает панель, а панель, оказавшись на экране, забирает его в поле чата.
 */
export const useChatHandoffStore = create<ChatHandoffStore>()((set, get) => ({
  pending: [],
  hand: (handoff) => set((state) => ({ pending: [...state.pending, handoff] })),
  take: (handoffs) => {
    const still = get().pending.filter((handoff) => handoffs.includes(handoff))

    if (still.length > 0) {
      set((state) => ({ pending: state.pending.filter((handoff) => !still.includes(handoff)) }))
    }

    return still
  },
}))

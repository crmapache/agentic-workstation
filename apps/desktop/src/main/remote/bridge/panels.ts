import type { Conversation } from '@shared/conversation'
import type { PanelCapabilities } from '@shared/panel-capabilities'
import type { ProviderId } from '@shared/providers'

import type { PanelsPort, ConversationsPort } from './bridge-ports'

/**
 * Разговоры всех панелей провайдеров для моста (ADR 0083). Телефон говорит id разговора, а не
 * провайдером: id - UUID вкладки, у двух панелей они не совпадают, поэтому команду ведёт та
 * панель, у которой этот id. Провайдер нужен телефону у каждой записи - он едет рядом с
 * разговором.
 */

/** Разговор и чья он панели. */
export type OwnedConversation = { provider: ProviderId; conversation: Conversation }

/** Разговор и панель, которая его ведёт: ей и уходят команды. */
export type Owner = { panel: ConversationsPort; conversation: Conversation }

/** Разговоры всех панелей - в порядке панелей и их полос вкладок. */
export const ownedConversations = (panels: PanelsPort): OwnedConversation[] =>
  panels.list().flatMap((panel) =>
    panel.getState().conversations.map((conversation) => ({
      provider: panel.provider,
      conversation,
    })),
  )

/** Панель, у которой разговор с этим id; ни у одной - null. */
export const ownerOf = (panels: PanelsPort, conversationId: string): Owner | null => {
  for (const panel of panels.list()) {
    const conversation = panel.getState().conversations.find((one) => one.id === conversationId)

    if (conversation) return { panel, conversation }
  }

  return null
}

/** Панель провайдера, которого назвал телефон; такой в IDE нет - null. */
export const panelOf = (panels: PanelsPort, provider: string): ConversationsPort | null =>
  panels.list().find((panel) => panel.provider === provider) ?? null

/** Что умеет провайдер панели сверх разговора: кнопки, которых нет у окна, - отказ и телефону. */
export type PanelFeature = keyof Pick<
  PanelCapabilities,
  'sideQuestion' | 'fastMode' | 'stopTask' | 'rewind' | 'carryOn'
>

export const supports = (panel: ConversationsPort, feature: PanelFeature): boolean =>
  panel.getState().capabilities[feature]

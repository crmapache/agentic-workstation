import type { Conversation } from '@shared/conversation'

import { useConversationActions } from './conversation-actions.hooks'
import { usePanelActions } from './panel-actions.hooks'
import { usePanelCapabilities } from './panel.queries'
import { usePanelStore } from './panel.store'
import type { PanelAction, PanelCommandId } from './slash.types'
import { SCREEN_VIEWS } from './SideMenu/SideMenu.constants'

/**
 * Карта команд панели: «/команда» выполняет IDE, а не CLI (как в ACC). Команда видна в
 * подсказке, только когда у неё есть действие и провайдер это умеет; аргумент - то, что
 * набрано после имени.
 */
export const usePanelCommands = (
  conversation: Conversation | null,
): Partial<Record<PanelCommandId, PanelAction>> => {
  const openMenu = usePanelStore((store) => store.openMenu)
  const actions = useConversationActions()
  const capabilities = usePanelCapabilities()
  // /rename, /btw, /fast, /login, /logout, /design-login (panel-actions.hooks.ts).
  const own = usePanelActions(conversation)

  return {
    ...own,
    resume: () => openMenu('history'),
    ...(conversation && capabilities.fork
      ? { fork: () => void actions.fork(conversation.id, null) }
      : {}),
    // /status: строка SESSION в ленте - id разговора и как продолжить его в терминале.
    ...(conversation ? { status: () => void actions.showSessionInfo(conversation.id) } : {}),
    // Голый /config открывает экран настроек Claude Code; с «ключ=значение» его делает CLI.
    ...(SCREEN_VIEWS.claudeConfig && capabilities.config
      ? { config: () => openMenu('claudeConfig') }
      : {}),
  }
}

import type { PanelKeyCommand } from '../conversation'

/**
 * Часть контракта (contract.ts) про полосу вкладок разговоров: закрытие и возврат,
 * порядок и группы форков, имена, клавиши панели. Отдельным файлом по области: общий
 * контракт перерос лимит строк. В InvokeContract, EventContract и списки каналов она
 * входит целиком, правила те же (.claude/rules/ipc-contract.md).
 */
export type ClaudeTabsInvokeContract = {
  /**
   * Фокус вошёл в правую панель или ушёл из неё: ⌘W меню тогда закрывает вкладку
   * разговора, а не окно (событие claude:panelKey).
   */
  'claude:setPanelFocus': { request: { focused: boolean }; response: void }
}

export type ClaudeTabsEventContract = {
  /** Клавиша панели, которую поймало меню приложения (⌘W при фокусе в панели). */
  'claude:panelKey': PanelKeyCommand
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const CLAUDE_TABS_CHANNELS = {
  'claude:setPanelFocus': true,
} satisfies Record<keyof ClaudeTabsInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const CLAUDE_TABS_EVENTS = {
  'claude:panelKey': true,
} satisfies Record<keyof ClaudeTabsEventContract, true>

import type { AgentPanelState } from '../conversation'
import type { AsideView, CliSearch, AsideThread, PanelTerminalCommand } from '../panel-extras'

type ConversationRequest = { conversationId: string }

/**
 * Часть контракта (contract.ts) про служебные возможности панели Claude Code: вопрос
 * сбоку (/btw), продолжение оборванной работы, вход в Claude Design, путь к CLI, проба
 * аккаунтов. Отдельным файлом по области; правила те же (.claude/rules/ipc-contract.md).
 */
export type ClaudePanelInvokeContract = {
  /** Цепочка вопросов сбоку вкладки (пустая, если не спрашивали). */
  'claudePanel:getAside': { request: ConversationRequest; response: AsideThread }
  /**
   * Спросить сбоку: CLI отвечает по разговору, не останавливая ход и ничего не записывая
   * в транскрипт. Пустой вопрос - открыть цепочку; replaces - спросить снова на месте
   * вопроса, который кончился без ответа. Ответ придёт событием claudePanel:aside.
   */
  'claudePanel:askAside': {
    request: ConversationRequest & { question: string; replaces: string | null }
    response: AsideThread
  }
  /** Отменить вопрос сбоку, который ещё ждёт ответа. */
  'claudePanel:cancelAside': {
    request: ConversationRequest & { askId: string }
    response: AsideThread
  }
  /** Показать или закрыть карточку вопросов сбоку: закрыть - не забыть. */
  'claudePanel:showAside': {
    request: ConversationRequest & { open: boolean }
    response: AsideThread
  }
  /**
   * «Don't continue» под планом продолжения: слова панели снимаются, ожидание лимита
   * остаётся тихим - очередь уйдёт в момент сброса.
   */
  'claudePanel:cancelCarryOn': { request: ConversationRequest; response: AgentPanelState }
  /**
   * Команда CLI, которую потоковый CLI не выполняет, - в Терминале, в хранилище аккаунта в
   * работе: вход в Claude Design (`/design-login`) и выход (`/logout`).
   */
  'claudePanel:terminalCommand': {
    request: { command: PanelTerminalCommand }
    response: AgentPanelState
  }
  /** Где панель искала CLI и какой путь назван руками (экран «Claude Code not found»). */
  'claudePanel:cliSearch': { request: void; response: CliSearch }
  /**
   * Путь к CLI руками («Use this»): главный процесс проверяет, что это Claude Code, и
   * ищет заново. Пустая строка - снова искать самой панели.
   */
  'claudePanel:setCliPath': {
    request: { path: string }
    response: { state: AgentPanelState; search: CliSearch }
  }
}

export type ClaudePanelEventContract = {
  /** Цепочка вопросов сбоку вкладки изменилась: вопрос, повтор API, ответ, отмена. */
  'claudePanel:aside': AsideView
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const CLAUDE_PANEL_CHANNELS = {
  'claudePanel:getAside': true,
  'claudePanel:askAside': true,
  'claudePanel:cancelAside': true,
  'claudePanel:showAside': true,
  'claudePanel:cancelCarryOn': true,
  'claudePanel:terminalCommand': true,
  'claudePanel:cliSearch': true,
  'claudePanel:setCliPath': true,
} satisfies Record<keyof ClaudePanelInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const CLAUDE_PANEL_EVENTS = {
  'claudePanel:aside': true,
} satisfies Record<keyof ClaudePanelEventContract, true>

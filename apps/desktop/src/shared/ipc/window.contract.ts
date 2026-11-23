import type { BarMenuEntry, WindowCommand, BarMenuCommand } from '../window'

/**
 * Часть контракта (contract.ts) про само окно IDE: его рама и команды меню приложения, у
 * которых нет своего вида. Отдельным файлом по области, правила те же
 * (.claude/rules/ipc-contract.md).
 */
export type WindowInvokeContract = {
  /**
   * Высота шапки окна в пикселях. Шапка растёт с размером текста (Settings → Appearance), а
   * «светофор» macOS рисует система поверх неё: его ставит по середине шапки главный
   * процесс.
   */
  'window:setTitleBarHeight': { request: { height: number }; response: void }
  /**
   * Кнопки полос окна для меню View (ADR 0112): какие есть и какие стоят в полосе. Решает окно -
   * его порядок и спрятанные живут в нём; меню их только зеркалит, на каждое изменение.
   */
  'window:setBarMenu': { request: { bars: BarMenuEntry[] }; response: void }
}

export type WindowEventContract = {
  'window:command': WindowCommand
  /** В меню View нажали галочку кнопки полосы или «вернуть как было». */
  'window:barMenu': BarMenuCommand
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const WINDOW_CHANNELS = {
  'window:setTitleBarHeight': true,
  'window:setBarMenu': true,
} satisfies Record<keyof WindowInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const WINDOW_EVENTS = {
  'window:command': true,
  'window:barMenu': true,
} satisfies Record<keyof WindowEventContract, true>

import type {
  MarkPoint,
  WalkthroughPen,
  WalkthroughMarksView,
  WalkthroughPanelView,
} from '../walkthrough'

/**
 * Часть контракта (contract.ts) про показ Walkthrough (ADR 0134, 0135): окно меток поверх экрана
 * спрашивает, что рисовать, когда открылось, получает каждую перемену и отдаёт пометки человека;
 * панель инструментов берёт и откладывает инструмент и стирает пометки. Начало показа - канал
 * голоса (voice:startWalkthrough): показ - это звонок.
 */
export type WalkthroughInvokeContract = {
  /** Что окно меток рисует сейчас: страница только открылась. */
  'walkthrough:view': { request: void; response: WalkthroughMarksView }
  /** Что показывает панель инструментов: страница только открылась. */
  'walkthrough:panel': { request: void; response: WalkthroughPanelView }
  /** Взять инструмент (тот же ещё раз или null - отложить). */
  'walkthrough:pick': { request: { pen: WalkthroughPen | null }; response: WalkthroughPanelView }
  /** Стереть пометки человека. */
  'walkthrough:erase': { request: void; response: WalkthroughPanelView }
  /** Человек нарисовал пометку: точки окна меток. */
  'walkthrough:stroke': { request: { pen: WalkthroughPen; points: MarkPoint[] }; response: void }
}

export type WalkthroughEventContract = {
  /** Метки поменялись - только окну меток. */
  'walkthrough:marks': WalkthroughMarksView
  /** Инструмент в руке или пометки поменялись - только панели. */
  'walkthrough:panelChanged': WalkthroughPanelView
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const WALKTHROUGH_CHANNELS = {
  'walkthrough:view': true,
  'walkthrough:panel': true,
  'walkthrough:pick': true,
  'walkthrough:erase': true,
  'walkthrough:stroke': true,
} satisfies Record<keyof WalkthroughInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const WALKTHROUGH_EVENTS = {
  'walkthrough:marks': true,
  'walkthrough:panelChanged': true,
} satisfies Record<keyof WalkthroughEventContract, true>

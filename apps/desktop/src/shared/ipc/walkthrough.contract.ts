import type { WalkthroughMarksView } from '../walkthrough'

/**
 * Часть контракта (contract.ts) про показ Walkthrough (ADR 0134): окно меток поверх экрана
 * спрашивает, что рисовать, когда открылось, и получает каждую перемену. Начало показа - канал
 * голоса (voice:startWalkthrough): показ - это звонок.
 */
export type WalkthroughInvokeContract = {
  /** Что окно меток рисует сейчас: страница только открылась. */
  'walkthrough:view': { request: void; response: WalkthroughMarksView }
}

export type WalkthroughEventContract = {
  /** Метки поменялись - только окну меток. */
  'walkthrough:marks': WalkthroughMarksView
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const WALKTHROUGH_CHANNELS = {
  'walkthrough:view': true,
} satisfies Record<keyof WalkthroughInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const WALKTHROUGH_EVENTS = {
  'walkthrough:marks': true,
} satisfies Record<keyof WalkthroughEventContract, true>

import type { CapsuleView, CapsuleAction, ComputerPermission } from '../computer'

/**
 * Часть контракта (contract.ts) про Computer Use (ADR 0057): капсула внизу экрана спрашивает,
 * что показать, и жмёт паузу и остановку; окно коннекторов просит разрешения macOS.
 */
export type ComputerInvokeContract = {
  /** Что показывает капсула сейчас; компьютер свободен - null. */
  'computer:capsule': { request: void; response: CapsuleView | null }
  /** Пауза, продолжение или остановка; ответ - капсула после него. */
  'computer:control': { request: { action: CapsuleAction }; response: CapsuleView | null }
  /**
   * Попросить разрешение macOS: система ставит IDE в список и открывается его настройка. Не
   * macOS - false.
   */
  'computer:allow': { request: { permission: ComputerPermission }; response: boolean }
}

export type ComputerEventContract = {
  /** Капсула поменялась - только самой капсуле, окну IDE это не нужно. */
  'computer:capsuleChanged': CapsuleView | null
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const COMPUTER_CHANNELS = {
  'computer:capsule': true,
  'computer:control': true,
  'computer:allow': true,
} satisfies Record<keyof ComputerInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const COMPUTER_EVENTS = {
  'computer:capsuleChanged': true,
} satisfies Record<keyof ComputerEventContract, true>

import type { ServiceAi } from '../service-ai'

/**
 * Часть контракта (contract.ts) про провайдера служебной работы IDE (Settings → AI). Отдельным
 * файлом по области; в InvokeContract и INVOKE_CHANNELS входит целиком
 * (.claude/rules/ipc-contract.md).
 */
export type ServiceAiInvokeContract = {
  'serviceAi:get': { request: void; response: ServiceAi }
  /** Настройка целиком; ответ - то, что встало (негодное отброшено). */
  'serviceAi:set': { request: { value: ServiceAi }; response: ServiceAi }
}

export type ServiceAiEventContract = {
  'serviceAi:changed': ServiceAi
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const SERVICE_AI_CHANNELS = {
  'serviceAi:get': true,
  'serviceAi:set': true,
} satisfies Record<keyof ServiceAiInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const SERVICE_AI_EVENTS = {
  'serviceAi:changed': true,
} satisfies Record<keyof ServiceAiEventContract, true>

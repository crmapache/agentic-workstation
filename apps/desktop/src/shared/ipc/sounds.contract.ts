import type { SoundPrefs } from '../sounds'

/**
 * Часть контракта (contract.ts) про звуки IDE (Settings → Sounds, ADR 0046). Отдельным файлом
 * по области; в InvokeContract и INVOKE_CHANNELS входит целиком (.claude/rules/ipc-contract.md).
 */
export type SoundsInvokeContract = {
  'sounds:get': { request: void; response: SoundPrefs }
  /** Настройка целиком; ответ - то, что встало (негодное отброшено). */
  'sounds:set': { request: { prefs: SoundPrefs }; response: SoundPrefs }
}

export type SoundsEventContract = {
  'sounds:changed': SoundPrefs
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const SOUNDS_CHANNELS = {
  'sounds:get': true,
  'sounds:set': true,
} satisfies Record<keyof SoundsInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const SOUNDS_EVENTS = {
  'sounds:changed': true,
} satisfies Record<keyof SoundsEventContract, true>

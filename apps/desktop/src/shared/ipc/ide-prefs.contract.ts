import type { IdePrefs, IdePrefsPatch } from '../ide-prefs'

/**
 * Часть контракта (contract.ts) про общие настройки IDE (Settings): сворачивание вставки, кто
 * пишет сообщение коммита. Отдельным файлом по области; в InvokeContract и INVOKE_CHANNELS
 * входит целиком (.claude/rules/ipc-contract.md).
 */
export type IdePrefsInvokeContract = {
  'idePrefs:get': { request: void; response: IdePrefs }
  /** Правка поверх нынешних; ответ - то, что встало (негодное отброшено). */
  'idePrefs:set': { request: { patch: IdePrefsPatch }; response: IdePrefs }
}

export type IdePrefsEventContract = {
  'idePrefs:changed': IdePrefs
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const IDE_PREFS_CHANNELS = {
  'idePrefs:get': true,
  'idePrefs:set': true,
} satisfies Record<keyof IdePrefsInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const IDE_PREFS_EVENTS = {
  'idePrefs:changed': true,
} satisfies Record<keyof IdePrefsEventContract, true>

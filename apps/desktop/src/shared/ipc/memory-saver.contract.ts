import type { MemorySaverState } from '../memory-saver'

/** Один переключатель для всех окон: сервер переключает актуальный выбор, а не снимок окна. */
export type MemorySaverInvokeContract = {
  'memorySaver:get': { request: void; response: MemorySaverState }
  'memorySaver:toggle': { request: void; response: MemorySaverState }
  /** Повторить текущий выбор (остановить снова, записать снова), не меняя режим. */
  'memorySaver:retry': { request: void; response: MemorySaverState }
}

export type MemorySaverEventContract = {
  'memorySaver:changed': MemorySaverState
}

export const MEMORY_SAVER_CHANNELS = {
  'memorySaver:get': true,
  'memorySaver:toggle': true,
  'memorySaver:retry': true,
} satisfies Record<keyof MemorySaverInvokeContract, true>

export const MEMORY_SAVER_EVENTS = {
  'memorySaver:changed': true,
} satisfies Record<keyof MemorySaverEventContract, true>

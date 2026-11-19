/** Пределы песочницы расширения (ADR 0091). */
export type SandboxLimits = {
  /** Потолок памяти WebAssembly модуля QuickJS: дальше - «out of memory» внутри песочницы. */
  memoryBytes: number
  stackBytes: number
  /** Срок одного захода в код расширения: вечный цикл обрывается на нём. */
  sliceMs: number
  /** Сколько таймеров одновременно. */
  timers: number
}

export const SANDBOX_LIMITS: SandboxLimits = {
  memoryBytes: 64 * 1024 * 1024,
  stackBytes: 512 * 1024,
  sliceMs: 1000,
  timers: 200,
}

/** Страница памяти WebAssembly. */
export const WASM_PAGE = 64 * 1024

/** Сколько запуск ждёт activate, прежде чем считать расширение поднятым. */
export const START_WAIT_MS = 10_000

/** Самый частый таймер: setTimeout чаще - тот же круг, setInterval - не чаще этого. */
export const TIMEOUT_MIN_MS = 4
export const INTERVAL_MIN_MS = 50

/** Модуль-загрузчик: импортирует main расширения и кладёт его экспорт под рукой прелюдии. */
export const BOOT_MODULE = '__aw_boot.js'

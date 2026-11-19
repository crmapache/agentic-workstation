import type { ExtensionProblem } from '@shared/extensions'

import type { SandboxLimits } from './sandbox.constants'
import { WASM_PAGE } from './sandbox.constants'

/** Песочница сломана (срок, память, не загрузилась): её больше нет, причина - в problem. */
export class SandboxBroken extends Error {
  constructor(readonly problem: ExtensionProblem) {
    super(problem.detail)
  }
}

/** Модуль main расширения: его экспорт ждёт activate. */
export const bootCode = (main: string): string =>
  `import * as main from ${JSON.stringify(`./${main}`)}\nglobalThis.__aw_main = main\n`

/** activate(ide) расширения, если он есть; deactivate запоминается до остановки. */
export const ACTIVATE_CODE = `(async () => {
  const main = globalThis.__aw_main
  delete globalThis.__aw_main
  globalThis.__aw_deactivate = typeof main.deactivate === 'function' ? main.deactivate : null
  if (typeof main.activate === 'function') await main.activate(globalThis.ide)
})()`

export const DEACTIVATE_CODE = `(async () => {
  if (globalThis.__aw_deactivate) await globalThis.__aw_deactivate()
})()`

/**
 * Причина из ошибки QuickJS: «interrupted» - вышел срок, «out of memory» - потолок памяти,
 * остальное - сообщение и стек как есть.
 */
export const problemOf = (dumped: unknown, code: ExtensionProblem['code']): ExtensionProblem => {
  const error = isRecord(dumped) ? dumped : { message: String(dumped) }
  const message = typeof error['message'] === 'string' ? error['message'] : String(dumped)
  const stack = typeof error['stack'] === 'string' ? error['stack'].trim() : ''

  if (message === 'interrupted') {
    return { code: 'timeout', detail: 'The extension ran longer than 1 second without a pause.' }
  }

  if (message === 'out of memory') {
    return { code: 'memory', detail: 'The extension used more memory than it may (64 MB).' }
  }

  const name =
    typeof error['name'] === 'string' && error['name'] !== 'Error' ? `${error['name']}: ` : ''

  return { code, detail: stack ? `${name}${message}\n${stack}` : `${name}${message}` }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Память WebAssembly с потолком: типов WebAssembly нет в библиотеках главного процесса. */
type WasmApi = { Memory: new (descriptor: { initial: number; maximum: number }) => unknown }

export const cappedMemory = (limits: SandboxLimits): unknown => {
  const { Memory } = (globalThis as unknown as { WebAssembly: WasmApi }).WebAssembly

  return new Memory({
    initial: Math.min(256, limits.memoryBytes / WASM_PAGE),
    maximum: limits.memoryBytes / WASM_PAGE,
  })
}

import type { BrowserErrorCode } from '@agentic-workstation/browser-protocol/protocol'

/** Отказ метода с кодом: уходит в IDE ответом, а не обрывом связи. */
export class MethodError extends Error {
  constructor(
    readonly code: BrowserErrorCode,
    message: string,
  ) {
    super(message)
  }
}

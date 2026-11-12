import type { BrowserErrorCode } from '@agentic-workstation/browser-protocol/protocol'

/**
 * Почему браузер не ответил: профиль не подключён, расширение не успело, вызов отменили, IDE
 * гасит связь - или отказ самого расширения (BrowserErrorCode).
 */
export type BrowserFailure =
  'profile-offline' | 'timeout' | 'aborted' | 'stopped' | BrowserErrorCode

/**
 * Отказ браузера. Текст понятен модели (английский, как весь вывод инструментов): шлюз
 * отдаёт его как ответ инструмента, а не роняет вызов.
 */
export class BrowserError extends Error {
  constructor(
    readonly code: BrowserFailure,
    message: string,
  ) {
    super(message)
  }
}

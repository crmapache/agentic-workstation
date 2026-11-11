import { toBase64Url } from '@agentic-workstation/remote-protocol/base64'

/**
 * id, который называет сам телефон: вопрос сбоку, поиск модели, черновик сценария - по нему их
 * отменяют и сохраняют. Случайный base64url, как id команды: влезает в ID протокола.
 */
export const newId = (): string =>
  toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(12)))

/**
 * Тело кадра - JSON-объект в UTF-8. TextEncoder и TextDecoder есть и у Node, и у браузера
 * телефона, поэтому кодирование одно на обе стороны.
 */

const encoder = new TextEncoder()

const decoder = new TextDecoder('utf-8', { fatal: true })

export const encodeBody = (message: object): Uint8Array => encoder.encode(JSON.stringify(message))

/** Объект из тела или null: не UTF-8, не JSON, не объект - не наше сообщение. */
export const decodeBody = (bytes: Uint8Array): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(decoder.decode(bytes))

    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** Сколько байт займёт текст в UTF-8 - без самого кодирования, для бюджета кадра. */
export const utf8Length = (text: string): number => {
  let bytes = 0

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)

    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      index += 1
    } else bytes += 3
  }

  return bytes
}

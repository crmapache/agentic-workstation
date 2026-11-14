import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

import type { CliMessage } from '../cli/cli-messages'
import { recordField, stringField, parseCliLine } from '../cli/cli-messages'
import { queuedPrompt } from '../feed/queued-prompt'
import { userTextOf } from '../feed/user-text'

/**
 * Содержимое сообщения messageId в строке: своя строка user или вложение очереди, под
 * которым CLI хранит написанное посреди хода (у вложения свой uuid, наш - в source_uuid).
 * Строка не про это сообщение - undefined.
 */
const contentOf = (message: CliMessage, messageId: string): unknown => {
  if (stringField(message, 'uuid') === messageId && message.type === 'user') {
    return recordField(message, 'message')['content']
  }

  const queued = queuedPrompt(message)

  return queued?.id === messageId ? queued.content : undefined
}

/**
 * Картинка сообщения целиком из транскрипта, как data URL; нет - null. Файл читается
 * построчно до нужной строки: транскрипт бывает десятками мегабайт, а держать все
 * картинки разговора в памяти ради того, что откроют одну, незачем.
 */
export const readTranscriptImage = async (
  file: string,
  messageId: string,
  index: number,
): Promise<string | null> => {
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })

  try {
    for await (const line of lines) {
      if (!line.includes(messageId)) continue

      const message = parseCliLine(line)
      const content = message ? contentOf(message, messageId) : undefined

      if (content === undefined) continue

      const image = userTextOf(content)?.images[index]

      return image ? `data:${image.mediaType};base64,${image.data}` : null
    }
  } finally {
    lines.close()
  }

  return null
}

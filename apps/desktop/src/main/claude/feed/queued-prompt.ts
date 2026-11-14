import type { CliMessage } from '../cli/cli-messages'
import { recordField, stringField } from '../cli/cli-messages'

/** Сообщение человека, написанное посреди хода: наш uuid и содержимое, как у строки user. */
export type QueuedPrompt = { id: string; content: unknown }

/**
 * Написанное посреди хода CLI пишет в транскрипт не строкой user, а вложением очереди
 * (`queued_command`, режим `prompt`): слова и картинки - в `prompt`, наш uuid сообщения -
 * в `source_uuid`, у самой строки uuid свой (замер на 2.1.293). Тем же вложением с режимом
 * `task-notification` приходят отчёты фоновых агентов - это не слова человека. Другое - null.
 */
export const queuedPrompt = (message: CliMessage): QueuedPrompt | null => {
  if (message.type !== 'attachment') return null

  const attachment = recordField(message, 'attachment')

  if (stringField(attachment, 'type') !== 'queued_command') return null
  if (stringField(attachment, 'commandMode') !== 'prompt') return null

  const id = stringField(attachment, 'source_uuid') || stringField(message, 'uuid')

  return id ? { id, content: attachment['prompt'] } : null
}

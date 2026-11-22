import type { ImageAttachment } from '@shared/conversation'
import { IMAGE_MEDIA_TYPES } from '@shared/conversation'
import type { VoiceMark } from '@shared/voice'

import { isRecord, recordField, stringField } from '../cli/cli-messages'
import { isVoiceNote, voiceFromNote } from '../../agents/conversation/voice-note'
import type { ShellRun } from '../../agents/shell/shell-text'
import { splitShellText } from '../../agents/shell/shell-text'

/** Сообщение человека из транскрипта: текст, картинки и команды «!», ехавшие перед ним. */
export type UserText = {
  text: string
  images: ImageAttachment[]
  shellRuns: ShellRun[]
  /** Сказано голосом в звонке: блок голосовой пометки рядом со словами. */
  voice?: VoiceMark | undefined
}

/** Картинка из блока `image` с base64 внутри; ссылки и прочее - не картинка для ленты. */
const imageOf = (block: Record<string, unknown>): ImageAttachment | null => {
  const source = recordField(block, 'source')
  const mediaType = IMAGE_MEDIA_TYPES.find((type) => type === source['media_type'])
  const data = stringField(source, 'data')

  return mediaType && data ? { mediaType, data } : null
}

/** Служебные вставки CLI, которые человек не писал. */
const SERVICE_BLOCKS =
  /<(system-reminder|task-notification|local-command-stdout|local-command-stderr|local-command-caveat|command-message)>[\s\S]*?<\/\1>/g

const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/

/** Отметка CLI о том, что ход остановил человек. */
export const INTERRUPT_MARKER = /^\[Request interrupted by user[^\]]*\]$/

/**
 * Текст сообщения человека для ленты из транскрипта: вызов команды CLI хранит как
 * `<command-name>`, его показываем как `/команда аргументы`, служебные вставки
 * выбрасываем. Ничего не осталось - null, такое сообщение в ленту не идёт.
 */
export const userTextOf = (content: unknown): UserText | null => {
  const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : content

  if (!Array.isArray(blocks)) return null

  const records = blocks.filter(isRecord)

  if (records.some((block) => block['type'] === 'tool_result')) return null

  const texts = records
    .filter((block) => block['type'] === 'text')
    .map((block) => stringField(block, 'text'))
  const note = texts.find(isVoiceNote)
  const voice = note ? (voiceFromNote(note) ?? undefined) : undefined
  const joined = texts.join('\n')
  const { runs: shellRuns, text: raw } = splitShellText(joined)
  const images = records
    .filter((block) => block['type'] === 'image')
    .map(imageOf)
    .filter((image) => image !== null)
  const command = COMMAND_NAME.exec(raw)?.[1]?.trim()

  if (command) {
    const args = COMMAND_ARGS.exec(raw)?.[1]?.trim()

    return { text: args ? `${command} ${args}` : command, images, shellRuns }
  }

  const text = raw.replace(SERVICE_BLOCKS, '').trim()

  if (!text && images.length === 0 && shellRuns.length === 0) return null

  return { text, images, shellRuns, ...(voice && { voice }) }
}

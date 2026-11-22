import type { ImageAttachment } from '@shared/conversation'
import { IMAGE_MEDIA_TYPES } from '@shared/conversation'
import type { EditorRef } from '@shared/message-draft'
import type { VoiceMark } from '@shared/voice'

import { isEditorNote, editorFromNote } from '../../agents/conversation/editor-note'
import { isVoiceNote, voiceFromNote } from '../../agents/conversation/voice-note'
import type { ShellRun } from '../../agents/shell/shell-text'
import { splitShellText } from '../../agents/shell/shell-text'

/** Сообщение человека из журнала Codex: слова, картинки, команды «!» перед ним, заметка о редакторе. */
export type CodexUserText = {
  text: string
  images: ImageAttachment[]
  shellRuns: ShellRun[]
  editor: EditorRef | null
  voice: VoiceMark | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

const DATA_URL = /^data:([^;]+);base64,(.+)$/s

/** Картинка, которую панель отправила data URL; ссылка на файл байтов не несёт - не картинка ленты. */
const imageOf = (item: Record<string, unknown>): ImageAttachment | null => {
  const [, type = '', data = ''] = DATA_URL.exec(text(item, 'url')) ?? []
  const mediaType = IMAGE_MEDIA_TYPES.find((known) => known === type)

  return mediaType && data ? { mediaType, data } : null
}

/**
 * Ввод сообщения человека (`userMessage.content`) - обратно в то, что видно в ленте. Панель
 * кладёт слова одним текстом (команды «!» - метками в его начале), заметку о редакторе -
 * отдельным текстом после него, картинки - data URL, навык «/имя» - элементом `skill` перед
 * словами (codex-session.ts): в ленте он снова «/имя» в начале сообщения.
 */
export const codexUserText = (content: unknown): CodexUserText => {
  const items = Array.isArray(content) ? content.filter(isRecord) : []
  const texts = items.filter((item) => item['type'] === 'text').map((item) => text(item, 'text'))
  const note = texts.find(isEditorNote)
  const voice = texts.find(isVoiceNote)
  const skill = items.find((item) => item['type'] === 'skill' && text(item, 'name'))
  const { runs, text: own } = splitShellText(
    texts.filter((value) => !isEditorNote(value) && !isVoiceNote(value)).join('\n\n'),
  )

  return {
    text: skill ? [`/${text(skill, 'name')}`, own].filter(Boolean).join(' ') : own,
    images: items
      .filter((item) => item['type'] === 'image')
      .map(imageOf)
      .filter((image) => image !== null),
    shellRuns: runs,
    editor: note ? editorFromNote(note) : null,
    voice: voice ? voiceFromNote(voice) : null,
  }
}

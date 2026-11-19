import { MAX_SELECTION_CHARS } from '@shared/message-draft'
import type { EditorRef } from '@shared/message-draft'

const HEADER = '# Context from my IDE setup:'

/** Чтобы случайно открытый файл не уводил ответ. */
const MAYBE = 'This may or may not be related to the current task.'

const rangeOf = (from: number, to: number) => (from === to ? `line ${from}` : `lines ${from}-${to}`)

/**
 * Заметка модели о том, что открыто в редакторе, - словами терминального Codex (`/ide`, как
 * в amazing-codex): блок Markdown «# Context from my IDE setup:», на нём обучены модели
 * Codex, и открытые модели (OpenCode) понимают его так же. После слов человека, а не перед
 * ними: начало первого сообщения - имя разговора в истории, и все разговоры над открытым
 * файлом назывались бы одинаково.
 */
export const editorNote = ({ path, from, to, text }: EditorRef): string => {
  const lines = [HEADER, '', `## Active file: ${path}`]

  if (from !== undefined && to !== undefined) {
    lines.push('', `## Active selection range: ${rangeOf(from, to)}`, '')
    lines.push(
      text === undefined || text.length > MAX_SELECTION_CHARS
        ? '(The selection is too long to include here - read those lines from the file.)'
        : `## Active selection of the file:\n${text}`,
    )
  }

  return [...lines, '', MAYBE].join('\n')
}

const ACTIVE_FILE = /^## Active file: (.+)$/m
const RANGE = /^## Active selection range: lines? (\d+)(?:-(\d+))?$/m

/** Заметка ли это о редакторе - текст, который пишет editorNote. */
export const isEditorNote = (text: string): boolean => text.startsWith(HEADER)

/**
 * Заметка обратно в ссылку на редактор - для строки под сообщением в разговоре из журнала.
 * Только путь и строки: выделенный текст - дело модели, строке он не нужен.
 */
export const editorFromNote = (text: string): EditorRef | null => {
  const path = isEditorNote(text) ? ACTIVE_FILE.exec(text)?.[1]?.trim() : undefined

  if (!path) return null

  const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
  const range = RANGE.exec(text)

  if (!range) return { path, name }

  const from = Number(range[1])

  return { path, name, from, to: range[2] ? Number(range[2]) : from }
}

/**
 * Слова человека и заметка о редакторе из одного текста - у провайдера, которому сообщение
 * уходит одним текстом (OpenCode): заметка стоит последней, через пустую строку.
 */
export const splitEditorNote = (text: string): { text: string; editor: EditorRef | null } => {
  const at = text.startsWith(HEADER) ? 0 : text.lastIndexOf(`\n\n${HEADER}`)

  if (at < 0) return { text, editor: null }

  const note = text.slice(at).trimStart()

  return { text: text.slice(0, at).trimEnd(), editor: editorFromNote(note) }
}

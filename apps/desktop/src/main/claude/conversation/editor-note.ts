import { MAX_SELECTION_CHARS } from '@shared/message-draft'
import type { EditorRef } from '@shared/message-draft'

/**
 * Заметка модели о том, что открыто в редакторе, - словами терминального Claude Code
 * (как в ACC): модель, обученная на терминале, знает эту форму, а «may or may not be
 * related» не даёт случайно открытому файлу увести ответ. Заметка - отдельный блок
 * сообщения в <system-reminder>, а не хвост текста: заголовок разговора, поиск и лента
 * берут слова человека и её не видят.
 */

const MAYBE = 'This may or may not be related to the current task.'

/** Текст блока заметки для CLI. */
export const editorReminder = (ref: EditorRef): string => {
  const { path, from, to, text } = ref
  const body =
    from === undefined || to === undefined
      ? `The user opened the file ${path} in the IDE. ${MAYBE}`
      : text === undefined || text.length > MAX_SELECTION_CHARS
        ? `The user selected the lines ${from} to ${to} from ${path} in the IDE - too long to include here, read the file for them. ${MAYBE}`
        : `The user selected the lines ${from} to ${to} from ${path}:\n${text}\n\n${MAYBE}`

  return `<system-reminder>\n${body}\n</system-reminder>`
}

const OPENED =
  /^<system-reminder>\nThe user opened the file (.+) in the IDE\. This may or may not be related/
const SELECTED =
  /^<system-reminder>\nThe user selected the lines (\d+) to (\d+) from (.+?)(?::\n| in the IDE - too long)/

const nameOf = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

/**
 * Заметка обратно из блока транскрипта - для строки под сообщением в разговоре из
 * истории. Только блок, который целиком заметка: те же слова в тексте человека - это он
 * сам о ней говорит.
 */
export const editorFromReminder = (block: string): EditorRef | null => {
  const selected = SELECTED.exec(block)

  if (selected?.[3]) {
    return {
      path: selected[3],
      name: nameOf(selected[3]),
      from: Number(selected[1]),
      to: Number(selected[2]),
    }
  }

  const opened = OPENED.exec(block)

  return opened?.[1] ? { path: opened[1], name: nameOf(opened[1]) } : null
}

import type { editor } from 'monaco-editor'

import { noteManual } from '../../lib/activity-log'
import { editDelta } from './manual-edits.utils'

/** Вставка: события изменения, пришедшие сразу после paste, - вставленное, а не набранное. */
const PASTE_WINDOW_MS = 150

let pastedAt = 0
let watching = false

/**
 * Начать узнавать вставку - с первой открытой модели, а не при загрузке модуля: импорт без
 * побочных эффектов, и модуль не требует DOM там, где модели нет. Вставку узнаём по событию
 * документа в фазе перехвата: так она видна и в Monaco, и в поле разницы, а модель не говорит,
 * откуда текст.
 */
export const watchPastes = (): void => {
  if (watching) return

  watching = true
  document.addEventListener('paste', () => (pastedAt = Date.now()), true)
}

const extensionOf = (path: string): string => {
  const name = path.split('/').at(-1) ?? ''
  const dot = name.lastIndexOf('.')

  return dot > 0
    ? name
        .slice(dot + 1)
        .toLowerCase()
        .slice(0, 16)
    : ''
}

/**
 * Правка человека в редакторе - в статистику «код руками». Не считается: текст, пришедший с
 * диска (агент, терминал), отмена и повтор (это не новый код), замена модели целиком.
 */
export const noteEditorEdit = (
  projectId: string,
  path: string,
  event: editor.IModelContentChangedEvent,
  fromDisk: boolean,
): void => {
  if (fromDisk || event.isUndoing || event.isRedoing || event.isFlush) return

  noteManual(
    projectId,
    extensionOf(path),
    editDelta(event.changes, Date.now() - pastedAt < PASTE_WINDOW_MS),
  )
}

import type { EditorRef } from '@shared/claude-draft'

import { baseName } from '../../lib/path.utils'
import type { EditorSelection } from '../../state/editor-selection.store'
import type { EditorOnce, EditorChoice } from './editor-context.types'

/**
 * Открытый файл и выделение в сообщении (как в ACC): настройка «Open file and selection»
 * и исключение на одно сообщение из меню чипа. Правила держит тест.
 */

/**
 * Открытый в редакторе файл проекта - ссылкой для чипа и заметки модели; с выделением -
 * и его строки с текстом.
 */
export const editorRefOf = (
  relativePath: string,
  selection?: Pick<EditorSelection, 'from' | 'to' | 'text'> | null,
): EditorRef => ({
  path: relativePath,
  name: baseName(relativePath),
  ...(selection && {
    from: selection.from,
    to: selection.to,
    ...(selection.text !== undefined && { text: selection.text }),
  }),
})

/** Строки после имени: «12-18», «12» у одной; пусто - ничего не выделено. */
export const editorLines = (ref: EditorRef): string => {
  if (ref.from === undefined || ref.to === undefined) return ''

  return ref.from === ref.to ? `${ref.from}` : `${ref.from}-${ref.to}`
}

/** Подпись чипа и строки под сообщением: имя и строки через двоеточие. */
export const editorLabel = (ref: EditorRef): string => {
  const lines = editorLines(ref)

  return lines ? `${ref.name}:${lines}` : ref.name
}

/** По чему помнится исключение: тот же файл с теми же строками. Другие строки - заново. */
export const editorKey = (ref: EditorRef): string => `${ref.path}#${ref.from ?? ''}-${ref.to ?? ''}`

/** Уходит ли файл со следующим сообщением: настройка, если вкладка не сказала иначе. */
export const editorGoes = (
  shared: boolean,
  once: EditorOnce | undefined,
  ref: EditorRef,
): boolean => (once !== undefined && once.key === editorKey(ref) ? once.on : shared)

/** Какой пункт меню чипа отмечен: исключение, совпавшее с настройкой, - не исключение. */
export const editorChoice = (
  shared: boolean,
  once: EditorOnce | undefined,
  ref: EditorRef,
): EditorChoice => {
  if (editorGoes(shared, once, ref) !== shared) return 'once'

  return shared ? 'always' : 'never'
}

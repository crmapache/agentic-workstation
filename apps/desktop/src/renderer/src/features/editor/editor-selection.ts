import type { editor, IDisposable } from 'monaco-editor/editor/editor.api.js'

import { MAX_SELECTION_CHARS } from '@shared/message-draft'

import { useEditorSelectionStore } from '../../state/editor-selection.store'
import type { EditorSelection } from '../../state/editor-selection.store'
import { SELECTION_PUBLISH_DELAY_MS } from './editor.constants'
import { selectionLines } from './CodeEditor/CodeEditor.utils'

/** Что нужно от редактора, чтобы сказать полю Claude Code его выделение. */
type SelectionSource = Pick<
  editor.ICodeEditor,
  'getModel' | 'getSelection' | 'onDidChangeCursorSelection'
>

/** Чьё выделение: файл проекта, текст которого стоит в редакторе. */
type SelectionOwner = { projectId: string; path: string }

/** Выделение в редакторе для поля ввода Claude Code: строки и текст, если он не длинный. */
const selectionOf = (
  instance: SelectionSource,
  document: SelectionOwner | null,
): EditorSelection | null => {
  const model = instance.getModel()
  const range = instance.getSelection()

  if (!document || !model || !range || range.isEmpty()) return null

  const text =
    model.getValueLengthInRange(range) <= MAX_SELECTION_CHARS
      ? model.getValueInRange(range)
      : undefined

  return { projectId: document.projectId, path: document.path, ...selectionLines(range), text }
}

/** Слежение за выделением редактора; publish - сказать полю его выделение прямо сейчас. */
export type SelectionWatch = IDisposable & { publish: () => void }

/**
 * Выделение после короткой паузы уходит полю ввода Claude Code: пока выделяют мышью, поле
 * не перерисовывается на каждый сдвиг. Редакторов в середине два (файл и разница), и
 * говорит тот, что на виду (isShown); показанный снова говорит своё выделение (publish).
 * Уходя, редактор убирает из поля только своё: выделение соседа остаётся. document - файл,
 * чей текст в редакторе сейчас.
 */
export const watchSelection = (
  instance: SelectionSource,
  document: () => SelectionOwner | null,
  isShown: () => boolean,
): SelectionWatch => {
  let timer: number | undefined
  let published: EditorSelection | null = null

  const publish = () => {
    published = selectionOf(instance, document())
    useEditorSelectionStore.getState().setSelection(published)
  }

  const listener = instance.onDidChangeCursorSelection(() => {
    window.clearTimeout(timer)
    if (isShown()) timer = window.setTimeout(publish, SELECTION_PUBLISH_DELAY_MS)
  })

  return {
    publish,
    dispose: () => {
      const { selection, setSelection } = useEditorSelectionStore.getState()

      window.clearTimeout(timer)
      listener.dispose()
      if (published !== null && selection === published) setSelection(null)
    },
  }
}

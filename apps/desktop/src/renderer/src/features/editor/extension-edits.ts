import type { editor } from 'monaco-editor/editor/editor.api.js'

import { monaco } from './monaco-setup'

/** Чей документ у модели редактора: проект и путь; не документ IDE - undefined. */
type OwnerOf = (model: editor.ITextModel | null) => { projectId: string; path: string } | undefined

/**
 * Правка от расширения в редакторе, где этот файл сейчас на виду (ADR 0091): вставка у курсора
 * или замена выделенного - одним шагом отмены, как своя правка человека. Автосохранение запишет
 * её само. Файл не на виду - false: молча писать в спрятанный редактор нельзя.
 */
export const editShown = (
  ownerOf: OwnerOf,
  projectId: string,
  path: string,
  kind: 'insert' | 'replace',
  text: string,
): boolean => {
  const instance = monaco.editor.getEditors().find((candidate) => {
    const owner = ownerOf(candidate.getModel())

    return (
      owner?.projectId === projectId &&
      owner.path === path &&
      candidate.getDomNode()?.offsetParent !== null
    )
  })
  const selection = instance?.getSelection()

  if (!instance || !selection) return false

  const range =
    kind === 'replace'
      ? selection
      : new monaco.Range(
          selection.positionLineNumber,
          selection.positionColumn,
          selection.positionLineNumber,
          selection.positionColumn,
        )

  instance.pushUndoStop()
  instance.executeEdits('extension', [{ range, text, forceMoveMarkers: true }])
  instance.pushUndoStop()

  return true
}

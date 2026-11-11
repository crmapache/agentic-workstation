import type { RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { editor } from 'monaco-editor/editor/editor.api.js'

import type { ChatOwner } from '../editor-chat'

/** Где открыть меню: точка от левого верхнего угла редактора, в CSS-пикселях. */
export type MenuPoint = { x: number; y: number }

/** Пункт меню редактора: действие Monaco, его сочетание и подпись из en.json. */
export type EditorMenuEntry = {
  name: 'changeAll' | 'cut' | 'copy' | 'paste' | 'commandPalette'
  /** Команда Monaco - та же, что стоит за сочетанием клавиш. */
  command: string
  /** Сочетание, как его показывает Monaco: пункт меню учит клавишам. */
  keys: string
  icon: LucideIcon
  /** Меняет текст: в файле только для чтения пункт недоступен. */
  edits: boolean
}

export type EditorContextMenuProps = {
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>
  /** Точка, где открыли меню; null - меню закрыто. */
  at: MenuPoint | null
  readOnly: boolean
  /**
   * Файл в редакторе: с ним в меню «Send to Chat», а у файла проекта - ещё и его локальная
   * история. Нет - пунктов нет (разница).
   */
  chatOwner?: ChatOwner | undefined
  /** Было ли выделение, когда меню открыли: без него отправлять нечего. */
  hasSelection?: boolean | undefined
  onClose: () => void
}

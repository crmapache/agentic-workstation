import { Copy, Command, Scissors, ReplaceAll, ClipboardPaste } from 'lucide-react'
import type { editor } from 'monaco-editor/editor/editor.api.js'

import { monaco } from '../monaco-setup'
import type { EditorMenuEntry } from './EditorContextMenu.types'

/**
 * Меню правой кнопки в коде - то же, что предлагало меню Monaco, группами через линию:
 * правка всех вхождений, буфер обмена, палитра команд Monaco. Переход к определению - свой
 * пункт у кода (EditorContextMenu, ADR 0061), форматирования нет: его дадут языковые серверы.
 */
export const EDITOR_MENU: readonly (readonly EditorMenuEntry[])[] = [
  [
    {
      name: 'changeAll',
      command: 'editor.action.changeAll',
      keys: '⌘F2',
      icon: ReplaceAll,
      edits: true,
    },
  ],
  [
    {
      name: 'cut',
      command: 'editor.action.clipboardCutAction',
      keys: '⌘X',
      icon: Scissors,
      edits: true,
    },
    {
      name: 'copy',
      command: 'editor.action.clipboardCopyAction',
      keys: '⌘C',
      icon: Copy,
      edits: false,
    },
    {
      name: 'paste',
      command: 'editor.action.clipboardPasteAction',
      keys: '⌘V',
      icon: ClipboardPaste,
      edits: true,
    },
  ],
  [
    {
      name: 'commandPalette',
      command: 'editor.action.quickCommand',
      keys: 'F1',
      icon: Command,
      edits: false,
    },
  ],
]

/** Откуда меню вызывает команду: Monaco передаёт источник обработчикам. */
export const MENU_SOURCE = 'contextMenu'

/** Действие Monaco «показать меню» (Shift+F10, палитра команд) - его место занимает наше. */
export const SHOW_MENU_ACTION = 'editor.action.showContextMenu'

/**
 * Куда правый клик открывает меню (цели мыши Monaco): текст, пустое место за строками и
 * поле ввода кода. На номерах строк, полях и полосах меню нет, как и у Monaco.
 */
export const MENU_TARGETS: ReadonlySet<editor.MouseTargetType> = new Set([
  monaco.editor.MouseTargetType.TEXTAREA,
  monaco.editor.MouseTargetType.CONTENT_TEXT,
  monaco.editor.MouseTargetType.CONTENT_EMPTY,
])

/**
 * Слои виджетов Monaco поверх кода: поля ввода, подсказки, всплывающие описания. Правый
 * клик по ним - не по коду: Monaco узнаёт их по элементу, а не по точке, так и мы.
 */
export const WIDGET_LAYERS =
  '.overlayWidgets, .overflowingOverlayWidgets, .contentWidgets, .overflowingContentWidgets'

import type { LucideIcon } from 'lucide-react'
import {
  Copy,
  Trash2,
  FilePlus,
  Scissors,
  FolderPlus,
  PencilLine,
  ClipboardCopy,
  ClipboardPaste,
} from 'lucide-react'

import type { TreeItem, TreeCommand } from './FileTreeView.types'

/** Пункт меню дерева: иконка и подсказка клавиши - те же, что ловит дерево (treeShortcut). */
export const COMMAND_LOOK: Record<TreeCommand, { icon: LucideIcon; keys?: string }> = {
  newFile: { icon: FilePlus },
  newFolder: { icon: FolderPlus },
  cut: { icon: Scissors, keys: '⌘X' },
  copy: { icon: Copy, keys: '⌘C' },
  paste: { icon: ClipboardPaste, keys: '⌘V' },
  copyPath: { icon: ClipboardCopy, keys: '⌥⌘C' },
  rename: { icon: PencilLine, keys: '⇧F6' },
  trash: { icon: Trash2, keys: '⌘⌫' },
}

/**
 * Группы меню через линию. «Создать» - только у папки и корня: файл внутри файла не создать.
 * У корня проекта нет вырезать, копировать, переименовать и корзины - это сам проект.
 */
export const MENU_GROUPS: readonly (readonly TreeCommand[])[] = [
  ['newFile', 'newFolder'],
  ['cut', 'copy', 'paste'],
  ['copyPath'],
  ['rename', 'trash'],
]

/** Только у папки (и корня). */
export const DIRECTORY_ONLY: ReadonlySet<TreeCommand> = new Set(['newFile', 'newFolder'])

/** Не у корня проекта. */
export const NOT_ON_ROOT: ReadonlySet<TreeCommand> = new Set(['cut', 'copy', 'rename', 'trash'])

/** Корень проекта - пустое место под строками. */
export const ROOT_ITEM: TreeItem = { path: '', isDirectory: true }

/** Пауза после набора имени перед поиском ссылок: не искать на каждую букву. */
export const REFERENCES_DELAY_MS = 300

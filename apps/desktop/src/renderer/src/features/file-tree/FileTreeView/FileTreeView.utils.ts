import type { KeyboardEvent } from 'react'

import { ROW_PATH, ROW_DIRECTORY } from '../file-tree.constants'
import { splitPath } from '../../../lib/path.utils'
import { NOT_ON_ROOT, DIRECTORY_ONLY } from './FileTreeView.constants'
import type { TreeItem, TreeCommand } from './FileTreeView.types'

/** Строка дерева под элементом (кнопка строки или что-то в ней); не строка - null. */
export const itemOf = (element: Element | null): { item: TreeItem; row: HTMLElement } | null => {
  const row = element?.closest<HTMLElement>(`[${ROW_PATH}]`)
  const path = row?.getAttribute(ROW_PATH)

  return row && path !== null && path !== undefined
    ? { item: { path, isDirectory: row.hasAttribute(ROW_DIRECTORY) }, row }
    : null
}

/** Есть ли действие у этого места: создать - в папке, корень проекта не вырезают и не удаляют. */
export const allows = (command: TreeCommand, item: TreeItem): boolean =>
  !(DIRECTORY_ONLY.has(command) && !item.isDirectory) &&
  !(NOT_ON_ROOT.has(command) && item.path === '')

/** Куда ложится новое и вставленное: в саму папку, а у файла - рядом с ним. */
export const directoryOf = (item: TreeItem): string =>
  item.isDirectory ? item.path : splitPath(item.path).folder

/** Путь с новым именем в той же папке. */
export const renamedPath = (path: string, name: string): string => {
  const parent = splitPath(path).folder

  return parent ? `${parent}/${name}` : name
}

/** Длина имени без расширения: при переименовании выделено оно, как в WebStorm и Finder. */
export const stemLength = (name: string, isDirectory: boolean): number => {
  const dot = name.lastIndexOf('.')

  return isDirectory || dot <= 0 ? name.length : dot
}

/**
 * Клавиша дерева - как в WebStorm и Finder: ⌘X, ⌘C, ⌘V, ⌥⌘C - путь, ⇧F6 и F2 - имя, ⌘⌫ и
 * Delete - в корзину. Остальное - не дерева.
 */
export const treeShortcut = (
  event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'altKey' | 'shiftKey' | 'ctrlKey'>,
): TreeCommand | null => {
  const { key, code, metaKey, altKey, shiftKey, ctrlKey } = event

  if (ctrlKey) return null
  if (key === 'F2' || (key === 'F6' && shiftKey)) return 'rename'
  if (key === 'Delete' || (key === 'Backspace' && metaKey)) return 'trash'
  if (!metaKey || shiftKey) return null
  if (code === 'KeyC') return altKey ? 'copyPath' : 'copy'
  if (altKey) return null
  if (code === 'KeyX') return 'cut'
  if (code === 'KeyV') return 'paste'

  return null
}

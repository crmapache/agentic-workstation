import type { FileMove, EntryKind } from '@shared/file-ops'
import type { Project } from '@shared/workspace'

/** Строка дерева или корень проекта (пустое место под строками): путь от корня, '' - корень. */
export type TreeItem = { path: string; isDirectory: boolean }

/** Где открыто меню правой кнопки: у строки или у точки нажатия на пустом месте. */
export type TreeMenuTarget = { item: TreeItem; anchor: HTMLElement } | null

/** Окно поверх дерева: имя нового, новое имя, перенос вырезанного, корзина. */
export type TreeDialog =
  | { kind: 'create'; parent: string; entry: EntryKind }
  | { kind: 'rename'; item: TreeItem }
  | { kind: 'move'; move: FileMove }
  | { kind: 'trash'; item: TreeItem }
  | null

/** Действие над строкой - из меню или клавишей. */
export type TreeCommand =
  'newFile' | 'newFolder' | 'cut' | 'copy' | 'paste' | 'copyPath' | 'rename' | 'trash'

export type ProjectTreeProps = { project: Project }

export type TreeHeaderProps = { projectId: string }

export type TreeMenuProps = {
  target: TreeMenuTarget
  canPaste: boolean
  onCommand: (command: TreeCommand, item: TreeItem) => void
  onClose: () => void
}

/** Проект окна дерева: id для действий, корень - для полного пути. */
export type TreeProject = Pick<Project, 'id' | 'rootPath'>

export type CreateDialogProps = {
  project: TreeProject
  parent: string
  entry: EntryKind
  onClose: () => void
}

export type RenameDialogProps = { project: TreeProject; item: TreeItem; onClose: () => void }

export type MoveDialogProps = { project: TreeProject; move: FileMove; onClose: () => void }

export type TrashDialogProps = { project: TreeProject; item: TreeItem; onClose: () => void }

export type ReferencesSwitchProps = {
  projectId: string
  /** Перенос, для которого искать ссылки; null - имя ещё не годится, искать нечего. */
  move: FileMove | null
  checked: boolean
  onChange: (checked: boolean) => void
}

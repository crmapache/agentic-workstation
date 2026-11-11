import { useState } from 'react'

import type { Project } from '@shared/workspace'

import { useFileActions } from '../file-tree.queries'
import { useFileTreeStore } from '../file-tree.store'
import { splitPath, isInsideAny } from '../../../lib/path.utils'
import type { TreeItem, TreeDialog, TreeCommand, TreeMenuTarget } from './FileTreeView.types'
import { allows, directoryOf } from './FileTreeView.utils'

/**
 * Действия дерева проекта - одни и те же из меню и с клавиатуры: какое окно открыть, что
 * положить в буфер, куда вставить. Вставка скопированного - сразу копия; вырезанного - окно
 * переноса (с правкой ссылок), а в ту же папку - ничего, вырезанное просто отпускается.
 */
export const useTreeCommands = (project: Project) => {
  const [menu, setMenu] = useState<TreeMenuTarget>(null)
  const [dialog, setDialog] = useState<TreeDialog>(null)
  const clipboard = useFileTreeStore((state) => state.clipboard)
  const setClipboard = useFileTreeStore((state) => state.setClipboard)
  const canPaste = clipboard?.projectId === project.id
  const actions = useFileActions(project)

  const paste = (item: TreeItem) => {
    if (!clipboard || clipboard.projectId !== project.id) return

    const directory = directoryOf(item)

    if (clipboard.mode === 'copy') {
      return actions.copy.mutate({ from: clipboard.path, toDirectory: directory })
    }
    if (isInsideAny(directory, [clipboard.path])) return actions.fail('intoItself')

    const { folder, name } = splitPath(clipboard.path)

    if (folder === directory) return setClipboard(null)

    setDialog({
      kind: 'move',
      move: { from: clipboard.path, to: directory ? `${directory}/${name}` : name },
    })
  }

  const commands: Record<TreeCommand, (item: TreeItem) => void> = {
    newFile: (item) => setDialog({ kind: 'create', parent: directoryOf(item), entry: 'file' }),
    newFolder: (item) =>
      setDialog({ kind: 'create', parent: directoryOf(item), entry: 'directory' }),
    cut: (item) => setClipboard({ projectId: project.id, path: item.path, mode: 'cut' }),
    copy: (item) => setClipboard({ projectId: project.id, path: item.path, mode: 'copy' }),
    paste,
    copyPath: (item) => void actions.copyPath(item.path),
    rename: (item) => setDialog({ kind: 'rename', item }),
    trash: (item) => setDialog({ kind: 'trash', item }),
  }

  const run = (command: TreeCommand, item: TreeItem) => {
    if (allows(command, item)) commands[command](item)
  }

  return { menu, setMenu, dialog, closeDialog: () => setDialog(null), canPaste, run }
}

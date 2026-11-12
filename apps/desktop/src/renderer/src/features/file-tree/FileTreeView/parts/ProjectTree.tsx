import { useState } from 'react'
import type { MouseEvent, KeyboardEvent } from 'react'

import { openWhenReleased } from '@agentic-workstation/ui/Popover.utils'

import { ROOT_ITEM } from '../FileTreeView.constants'
import { useTreeCommands } from '../FileTreeView.hooks'
import styles from '../FileTreeView.module.scss'
import type { ProjectTreeProps } from '../FileTreeView.types'
import { allows, itemOf, treeShortcut } from '../FileTreeView.utils'
import { DirectoryChildren } from '../../FileTreeNode/parts/DirectoryChildren'
import { withMacKeys } from '../../../../lib/keys'
import { CreateDialog } from './CreateDialog'
import { MoveDialog } from './MoveDialog'
import { RenameDialog } from './RenameDialog'
import { TrashDialog } from './TrashDialog'
import { TreeHeader } from './TreeHeader'
import { TreeMenu } from './TreeMenu'

/**
 * Дерево проекта с шапкой, меню правой кнопки и клавишами. Строка, над которой действие, -
 * по атрибутам кнопки строки (меню и клавиши ловятся здесь, одним обработчиком, а не в каждой
 * строке); пустое место под строками - корень проекта, его меню встаёт у точки нажатия.
 */
export const ProjectTree = ({ project }: ProjectTreeProps) => {
  const { menu, setMenu, dialog, closeDialog, canPaste, run } = useTreeCommands(project)
  // Якорь меню корня - точка нажатия на пустом месте. Стоит всегда: иначе панель открылась бы
  // на рендер позже меню, и меню не поставило бы фокус на первый пункт.
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null)
  const [point, setPoint] = useState<{ left: number; top: number } | null>(null)

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    const found = itemOf(event.target instanceof Element ? event.target : null)

    if (found) {
      const { item, row } = found

      return openWhenReleased(event.nativeEvent, () => setMenu({ item, anchor: row }))
    }

    const box = event.currentTarget.getBoundingClientRect()

    setPoint({
      left: event.clientX - box.left + event.currentTarget.scrollLeft,
      top: event.clientY - box.top + event.currentTarget.scrollTop,
    })
    openWhenReleased(event.nativeEvent, () => anchor && setMenu({ item: ROOT_ITEM, anchor }))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const command = treeShortcut(withMacKeys(event))
    const item = itemOf(document.activeElement)?.item ?? ROOT_ITEM

    if (!command || !allows(command, item)) return

    event.preventDefault()
    run(command, item)
  }

  const handleMenuClosed = () => setMenu(null)

  return (
    <div className={styles.view}>
      <TreeHeader projectId={project.id} />
      <div className={styles.tree} onContextMenu={handleContextMenu} onKeyDown={handleKeyDown}>
        <DirectoryChildren projectId={project.id} relativePath="" depth={0} />
        <span
          ref={setAnchor}
          className={styles.anchor}
          // eslint-disable-next-line no-restricted-syntax -- точка нажатия известна только в рантайме
          style={point ?? undefined}
        />
      </div>
      <TreeMenu target={menu} canPaste={canPaste} onCommand={run} onClose={handleMenuClosed} />
      {dialog?.kind === 'create' && (
        <CreateDialog
          project={project}
          parent={dialog.parent}
          entry={dialog.entry}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog project={project} item={dialog.item} onClose={closeDialog} />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog project={project} move={dialog.move} onClose={closeDialog} />
      )}
      {dialog?.kind === 'trash' && (
        <TrashDialog project={project} item={dialog.item} onClose={closeDialog} />
      )}
    </div>
  )
}

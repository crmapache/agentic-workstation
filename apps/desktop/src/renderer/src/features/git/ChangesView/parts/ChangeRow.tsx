import type { DragEvent, MouseEvent, KeyboardEvent } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'
import { openWhenReleased } from '@agentic-workstation/ui/Popover.utils'

import { CHANGE_LETTERS } from '../ChangesView.constants'
import styles from '../ChangesView.module.scss'
import type { ChangeRowProps } from '../ChangesView.types'
import { splitPath } from '../../../../lib/path.utils'
import { writeProjectPaths } from '../../../../lib/project-drag'
import { diffTabKey } from '../../../../state/editor-tabs.utils'
import { useActiveTab, useSelectionStore } from '../../../../state/selection.store'

/**
 * Строка изменённого файла: иконка типа, имя цветом вида изменения (как в дереве), папка
 * (теряет начало, а не конец), откуда переименован, буква вида справа. Нажатие - разница в
 * середине окна; двойное нажатие и F4 - сам файл, как Jump to Source в WebStorm; правая
 * кнопка - меню. Строку можно бросить в поле Claude Code, как строку дерева.
 */
export const ChangeRow = ({ projectId, change, onMenu }: ChangeRowProps) => {
  const { t } = useTranslation()
  const isSelected = useActiveTab(projectId) === diffTabKey(change.path)
  const openDiff = useSelectionStore((state) => state.openDiff)
  const selectFile = useSelectionStore((state) => state.selectFile)
  const { folder, name } = splitPath(change.path)
  const isDeleted = change.kind === 'deleted'

  const handleClick = () => openDiff(projectId, change.path)

  // Удалённого файла на диске нет - открывать нечего, его видно только в разнице.
  const handleOpenFile = () => {
    if (!isDeleted) selectFile(projectId, change.path)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'F4') return

    event.preventDefault()
    handleOpenFile()
  }

  const handleContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const anchor = event.currentTarget

    event.preventDefault()
    openWhenReleased(event.nativeEvent, () => onMenu(change, anchor))
  }

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) =>
    writeProjectPaths(event.dataTransfer, [change.path])

  return (
    <li>
      <button
        type="button"
        className={clsx(styles.row, isSelected && styles.selected)}
        aria-label={t('changes.rowLabel', {
          path: change.path,
          kind: t(`changes.kinds.${change.kind}`),
        })}
        draggable={!isDeleted}
        onDragStart={handleDragStart}
        onClick={handleClick}
        onDoubleClick={handleOpenFile}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}>
        <FileIcon path={change.path} kind="file" size="sm" />
        <span className={clsx(styles.name, styles[change.kind])}>{name}</span>
        {folder && (
          <span className={styles.folder}>
            <span className={styles.folderText}>{folder}</span>
          </span>
        )}
        {change.origin !== null && (
          <span className={styles.origin}>{t('changes.renamedFrom', { path: change.origin })}</span>
        )}
        <span className={clsx(styles.letter, styles[change.kind])} aria-hidden>
          {CHANGE_LETTERS[change.kind]}
        </span>
      </button>
    </li>
  )
}

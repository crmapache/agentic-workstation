import { useRef, useEffect } from 'react'
import type { DragEvent } from 'react'
import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'

import { ROW_PATH, ROW_DIRECTORY } from '../file-tree.constants'
import { useIsCut, useIsExpanded, useRevealSerial, useFileTreeStore } from '../file-tree.store'
import { useTreeStatus } from '../git-status.queries'
import { writeProjectPaths } from '../../../lib/project-drag'
import { useSelectedPath, useSelectionStore } from '../../../state/selection.store'
import { TREE_ICON_SIZE, TREE_ICON_STROKE_WIDTH } from './FileTreeNode.constants'
import styles from './FileTreeNode.module.scss'
import type { FileTreeNodeProps } from './FileTreeNode.types'
import { depthStyle } from './FileTreeNode.utils'
import { DirectoryChildren } from './parts/DirectoryChildren'

/**
 * Строка дерева: папка раскрывается и сворачивается, файл выбирается и уходит в
 * редактор. Иконка - по типу файла, цвет имени - по статусу git, как в WebStorm.
 * Вложенное содержимое папки рисует DirectoryChildren - тот же узел на уровень глубже. Меню
 * правой кнопки и клавиши ловит дерево целиком - по атрибутам строки; вырезанная - бледнее.
 */
export const FileTreeNode = ({ projectId, entry, depth }: FileTreeNodeProps) => {
  const isDirectory = entry.kind === 'directory'
  const isExpanded = useIsExpanded(projectId, entry.relativePath)
  const isSelected = useSelectedPath(projectId) === entry.relativePath
  const toggleDirectory = useFileTreeStore((state) => state.toggleDirectory)
  const selectFile = useSelectionStore((state) => state.selectFile)
  const revealSerial = useRevealSerial(projectId, entry.relativePath)
  const status = useTreeStatus(projectId, entry.relativePath, isDirectory)
  const isCut = useIsCut(projectId, entry.relativePath)
  const ref = useRef<HTMLButtonElement>(null)

  // Файл выбрали поиском (и даже тот же самый ещё раз), а строка за краем панели -
  // прокрутить к ней. Кликнутая строка и так видна, для неё это ничего не делает.
  // Папку не выбирают, её только показывают (ссылка в ленте) - к ней по просьбе.
  useEffect(() => {
    if (isSelected || (isDirectory && revealSerial > 0)) {
      ref.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [isSelected, isDirectory, revealSerial])

  const handleClick = () =>
    isDirectory
      ? toggleDirectory(projectId, entry.relativePath)
      : selectFile(projectId, entry.relativePath)

  // Строку можно бросить в поле Claude Code: файл или папка встанут туда чипом.
  const handleDragStart = (event: DragEvent<HTMLButtonElement>) =>
    writeProjectPaths(event.dataTransfer, [
      isDirectory ? `${entry.relativePath}/` : entry.relativePath,
    ])

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-expanded={isDirectory ? isExpanded : undefined}
        className={clsx(styles.row, isSelected && styles.selected, isCut && styles.cut)}
        {...{ [ROW_PATH]: entry.relativePath, [ROW_DIRECTORY]: isDirectory ? '' : undefined }}
        // eslint-disable-next-line no-restricted-syntax -- отступ зависит от глубины
        style={depthStyle(depth)}
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}>
        <ChevronRight
          size={TREE_ICON_SIZE}
          strokeWidth={TREE_ICON_STROKE_WIDTH}
          className={clsx(
            styles.chevron,
            isExpanded && styles.expanded,
            !isDirectory && styles.hidden,
          )}
          aria-hidden
        />
        <FileIcon
          path={entry.relativePath}
          kind={isDirectory ? 'folder' : 'file'}
          expanded={isExpanded}
        />
        <span className={clsx(styles.name, status && styles[status])}>{entry.name}</span>
      </button>
      {isDirectory && isExpanded && (
        <DirectoryChildren
          projectId={projectId}
          relativePath={entry.relativePath}
          depth={depth + 1}
        />
      )}
    </>
  )
}

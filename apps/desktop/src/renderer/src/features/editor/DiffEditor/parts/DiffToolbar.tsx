import clsx from 'clsx'
import {
  Rows2,
  ArrowUp,
  Columns2,
  ArrowDown,
  ArrowLeft,
  SquarePen,
  ArrowRight,
  ChevronsDownUp,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../DiffEditor.module.scss'
import type { DiffToolbarProps } from '../DiffEditor.types'
import { useDiffViewStore } from '../../diff-view.store'
import { splitPath } from '../../../../lib/path.utils'
import { useSelectionStore } from '../../../../state/selection.store'

/**
 * Панель над разницей, как у WebStorm: файл (имя цветом вида изменения, папка, откуда
 * переименован), сколько различий и что поменялось помимо строк, переходы по ним (F7, Shift+F7) и по файлам списка
 * изменений, сам файл (F4), свёрнутое неизменённое и две колонки или одна.
 */
export const DiffToolbar = ({
  projectId,
  path,
  change,
  summary,
  neighbours,
  actions,
}: DiffToolbarProps) => {
  const { t } = useTranslation()
  const openDiff = useSelectionStore((state) => state.openDiff)
  const layout = useDiffViewStore((state) => state.layout)
  const collapsed = useDiffViewStore((state) => state.collapsed)
  const setLayout = useDiffViewStore((state) => state.setLayout)
  const toggleCollapsed = useDiffViewStore((state) => state.toggleCollapsed)
  const { folder, name } = splitPath(path)
  const hasChanges = summary.key === 'differences'
  const counted =
    summary.key === 'none'
      ? ''
      : hasChanges
        ? t('editor.diff.differences', { count: summary.count })
        : t(`editor.diff.${summary.key}`)
  const notes = summary.notes.map((note) => t(`editor.diff.notes.${note}`)).join(', ')

  return (
    <div role="toolbar" aria-label={t('editor.diff.toolbar')} className={styles.toolbar}>
      <span className={styles.file}>
        <FileIcon path={path} kind="file" size="sm" />
        <span className={clsx(styles.name, change && styles[change.kind])}>{name}</span>
        {folder && (
          <span className={styles.folder}>
            <span className={styles.folderText}>{folder}</span>
          </span>
        )}
        {change?.origin && (
          <span className={styles.origin}>
            {t('editor.diff.renamedFrom', { path: change.origin })}
          </span>
        )}
      </span>
      <span className={styles.count} aria-live="polite">
        {[counted, notes].filter(Boolean).join(' · ')}
      </span>
      <span className={styles.group}>
        <IconButton
          icon={ArrowUp}
          size="sm"
          label={`${t('editor.diff.previousChange')} (⇧F7)`}
          disabled={!hasChanges}
          onClick={actions.previousChange}
        />
        <IconButton
          icon={ArrowDown}
          size="sm"
          label={`${t('editor.diff.nextChange')} (F7)`}
          disabled={!hasChanges}
          onClick={actions.nextChange}
        />
      </span>
      <span className={styles.group}>
        <IconButton
          icon={ArrowLeft}
          size="sm"
          label={t('editor.diff.previousFile')}
          disabled={!neighbours.previous}
          onClick={() => neighbours.previous && openDiff(projectId, neighbours.previous.path)}
        />
        <IconButton
          icon={ArrowRight}
          size="sm"
          label={t('editor.diff.nextFile')}
          disabled={!neighbours.next}
          onClick={() => neighbours.next && openDiff(projectId, neighbours.next.path)}
        />
      </span>
      <span className={styles.group}>
        <IconButton
          icon={SquarePen}
          size="sm"
          label={`${t('editor.diff.openFile')} (F4)`}
          disabled={!actions.openFile}
          onClick={actions.openFile ?? undefined}
        />
        <IconButton
          icon={ChevronsDownUp}
          size="sm"
          label={t('editor.diff.collapse')}
          active={collapsed}
          onClick={toggleCollapsed}
        />
      </span>
      <span role="group" aria-label={t('editor.diff.layout')} className={styles.group}>
        <IconButton
          icon={Columns2}
          size="sm"
          label={t('editor.diff.sideBySide')}
          active={layout === 'sideBySide'}
          onClick={() => setLayout('sideBySide')}
        />
        <IconButton
          icon={Rows2}
          size="sm"
          label={t('editor.diff.unified')}
          active={layout === 'unified'}
          onClick={() => setLayout('unified')}
        />
      </span>
    </div>
  )
}

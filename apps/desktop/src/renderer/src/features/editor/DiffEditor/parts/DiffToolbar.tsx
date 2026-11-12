import { ArrowLeft, SquarePen, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../DiffEditor.module.scss'
import type { DiffToolbarProps } from '../DiffEditor.types'
import { DiffSteps } from '../../DiffSteps/DiffSteps'
import { DiffViewToggles } from '../../DiffViewToggles/DiffViewToggles'
import { PathTitle } from '../../PathTitle/PathTitle'
import { useSelectionStore } from '../../../../state/selection.store'

/**
 * Панель над разницей, как у WebStorm: файл (имя цветом вида изменения, папка, откуда
 * переименован), сколько различий и что поменялось помимо строк, переходы по ним (F7,
 * Shift+F7) и по файлам списка изменений, сам файл (F4), свёрнутое неизменённое и две
 * колонки или одна.
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
      <PathTitle path={path} kind="file" tone={change?.kind}>
        {change?.origin && (
          <span className={styles.origin}>
            {t('editor.diff.renamedFrom', { path: change.origin })}
          </span>
        )}
      </PathTitle>
      <span className={styles.count} aria-live="polite">
        {[counted, notes].filter(Boolean).join(' · ')}
      </span>
      <DiffSteps
        hasChanges={hasChanges}
        onPrevious={actions.previousChange}
        onNext={actions.nextChange}
      />
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
      <IconButton
        icon={SquarePen}
        size="sm"
        label={`${t('editor.diff.openFile')} (F4)`}
        disabled={!actions.openFile}
        onClick={actions.openFile ?? undefined}
      />
      <DiffViewToggles />
    </div>
  )
}

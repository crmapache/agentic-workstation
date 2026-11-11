import { useTranslation } from 'react-i18next'

import { Tabs } from '@agentic-workstation/ui/Tabs'

import styles from '../LocalHistoryView.module.scss'
import type { HistoryDiffBarProps } from '../LocalHistoryView.types'
import type { HistoryCompare } from '../../editor.types'
import { useLocalHistoryStore } from '../../local-history.store'
import { DiffSteps } from '../../DiffSteps/DiffSteps'
import { DiffViewToggles } from '../../DiffViewToggles/DiffViewToggles'

/**
 * Полоса над разницей истории: что сравнить (с файлом сейчас или само изменение), сколько
 * различий, переходы по ним (F7, Shift+F7) и вид разницы - общий с разницей с коммитом.
 */
export const HistoryDiffBar = ({ count, onPrevious, onNext }: HistoryDiffBarProps) => {
  const { t } = useTranslation()
  const compare = useLocalHistoryStore((state) => state.compare)
  const setCompare = useLocalHistoryStore((state) => state.setCompare)
  const hasChanges = count !== null && count > 0

  return (
    <div className={styles.bar}>
      <Tabs<HistoryCompare>
        label={t('localHistory.compare.label')}
        items={[
          { id: 'current', label: t('localHistory.compare.current') },
          { id: 'change', label: t('localHistory.compare.change') },
        ]}
        value={compare}
        onChange={setCompare}
      />
      <span className={styles.count} aria-live="polite">
        {count === null
          ? ''
          : hasChanges
            ? t('editor.diff.differences', { count })
            : t('editor.diff.noDifferences')}
      </span>
      <DiffSteps hasChanges={hasChanges} onPrevious={onPrevious} onNext={onNext} />
      <DiffViewToggles />
    </div>
  )
}

import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import styles from '../TasksView.module.scss'
import type { RunListProps } from '../TasksView.types'
import { RunRow } from './RunRow'

/** Прогоны всех заданий, новые первыми: что шло, чем кончилось, сколько шло. */
export const RunList = ({ runs, now }: RunListProps) => {
  const { t } = useTranslation()

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={t('tasks.runsEmpty.title')}
        description={t('tasks.runsEmpty.note')}
      />
    )
  }

  return (
    <div className={styles.list}>
      {runs.map((run) => (
        <RunRow key={run.id} run={run} now={now} />
      ))}
    </div>
  )
}

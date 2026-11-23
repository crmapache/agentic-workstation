import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../TasksView.module.scss'
import type { RunListProps } from '../TasksView.types'
import { runsByDay } from '../TasksView.utils'
import { useTaskWords } from '../../tasks.hooks'
import { RunRow } from './RunRow'

/**
 * Прогоны всех заданий, новые первыми, по дням: день - подпись с числом прогонов и рамка со
 * строками через линию. Подряд идущие прогоны одного задания так не сливаются в одну кашу, а
 * время в строке - уже только час.
 */
export const RunList = ({ runs, now }: RunListProps) => {
  const { t } = useTranslation()
  const words = useTaskWords()

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
    <div className={styles.days}>
      {runsByDay(runs).map((day) => (
        <Section key={day.key} size="sm" title={words.day(day.at, now)} count={day.runs.length}>
          <div className={styles.runs}>
            {day.runs.map((run) => (
              <RunRow key={run.id} run={run} now={now} />
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}

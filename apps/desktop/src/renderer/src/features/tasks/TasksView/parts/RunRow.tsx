import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'

import styles from '../TasksView.module.scss'
import type { RunRowProps } from '../TasksView.types'
import { durationOf } from '../TasksView.utils'
import { STATE_TONES } from '../../tasks.constants'
import { useTaskWords } from '../../tasks.hooks'
import { useTaskRunStore } from '../../../../state/task-run.store'

/**
 * Прогон строкой: состояние, задание и начало отчёта (у пропуска - почему), справа - чем поднят,
 * когда и сколько шёл. Нажатие открывает прогон.
 */
export const RunRow = ({ run, now }: RunRowProps) => {
  const { t } = useTranslation()
  const words = useTaskWords()
  const open = useTaskRunStore((state) => state.open)
  const line = run.skip
    ? t(`tasks.skips.${run.skip}`)
    : run.failure
      ? t(`tasks.failures.${run.failure}`)
      : run.preview

  return (
    <button type="button" className={styles.runRow} onClick={() => open(run.id)}>
      <Badge tone={STATE_TONES[run.state]}>{t(`tasks.states.${run.state}`)}</Badge>
      <span className={styles.main}>
        <span className={styles.name}>{run.taskName}</span>
        {line && <span className={styles.line}>{line}</span>}
      </span>
      <span className={styles.runMeta}>
        {[
          t(`tasks.triggers.${run.trigger}`),
          words.moment(run.startedAt, now),
          durationOf(run, now),
        ].join(' · ')}
      </span>
    </button>
  )
}

import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'

import styles from '../TasksView.module.scss'
import type { RunRowProps } from '../TasksView.types'
import { durationOf } from '../TasksView.utils'
import { STATE_TONES } from '../../tasks.constants'
import { clockLabel } from '../../../../lib/dates.utils'
import { useTaskRunStore } from '../../../../state/task-run.store'

/**
 * Прогон строкой дня: слева показания - час запуска и сколько шёл (у пропуска длительности нет:
 * он шёл ноль секунд), в середине задание и начало отчёта (у пропуска - почему), справа - чем
 * кончился и чем поднят. Состояние - справа, а не перед именем: «Stopped» шире «Done» и сдвигал
 * бы имена в соседних строках. Нажатие открывает прогон.
 */
export const RunRow = ({ run, now }: RunRowProps) => {
  const { t } = useTranslation()
  const open = useTaskRunStore((state) => state.open)
  const line = run.skip
    ? t(`tasks.skips.${run.skip}`)
    : run.failure
      ? t(`tasks.failures.${run.failure}`)
      : run.preview

  return (
    <button type="button" className={styles.runRow} onClick={() => open(run.id)}>
      <span className={clsx(styles.runReading, styles.runTop)}>{clockLabel(run.startedAt)}</span>
      <span className={clsx(styles.name, styles.runMiddle, styles.runTop)}>{run.taskName}</span>
      <span className={clsx(styles.runState, styles.runTop)}>
        <Badge tone={STATE_TONES[run.state]}>{t(`tasks.states.${run.state}`)}</Badge>
      </span>
      <span className={clsx(styles.runReading, styles.runBottom)}>
        {run.state === 'skipped' ? '' : durationOf(run, now)}
      </span>
      <span className={clsx(styles.line, styles.runMiddle, styles.runBottom)}>{line}</span>
      <span className={clsx(styles.runTrigger, styles.runBottom)}>
        {t(`tasks.triggers.${run.trigger}`)}
      </span>
    </button>
  )
}

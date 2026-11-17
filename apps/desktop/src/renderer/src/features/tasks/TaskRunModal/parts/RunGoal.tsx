import { useTranslation } from 'react-i18next'

import styles from '../TaskRunModal.module.scss'
import type { RunGoalProps } from '../TaskRunModal.types'
import { GoalHistory } from './GoalHistory'
import { GoalJournal } from './GoalJournal'
import { GoalWait } from './GoalWait'

/**
 * Раздел поручения в окне прогона (ADR 0080): во что обошлось (работа и проверки порознь), чего
 * ждёт (пока жизнь не кончилась), журнал модели и история жизни.
 */
export const RunGoal = ({ life, now, workUsd, open }: RunGoalProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.goal}>
      <span className={styles.note}>
        {t('tasks.run.spent', { work: workUsd.toFixed(2), checks: life.checksUsd.toFixed(3) })}
      </span>
      {open && <GoalWait life={life} now={now} />}
      <GoalJournal life={life} />
      <GoalHistory life={life} now={now} />
    </div>
  )
}

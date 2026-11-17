import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import styles from '../TaskRunModal.module.scss'
import type { GoalPartProps } from '../TaskRunModal.types'
import { useConversationLog } from '../../../../state/conversation-log.context'

/** Журнал поручения - заметки модели для следующих глав, той же разметкой, что лента. */
export const GoalJournal = ({ life }: Pick<GoalPartProps, 'life'>) => {
  const { t } = useTranslation()
  const log = useConversationLog()
  const plain = <div className={styles.text}>{life.journal}</div>

  return (
    <div className={styles.block}>
      <span className={styles.caption}>{t('tasks.goal.journal')}</span>
      {!life.journal ? (
        <div className={styles.empty}>{t('tasks.goal.journalEmpty')}</div>
      ) : log ? (
        <Suspense fallback={plain}>
          <log.Text text={life.journal} />
        </Suspense>
      ) : (
        plain
      )}
    </div>
  )
}

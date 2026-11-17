import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { isRunLive } from '@shared/tasks'

import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../TaskRunModal.module.scss'
import type { RunPartProps } from '../TaskRunModal.types'
import { useConversationLog } from '../../../../state/conversation-log.context'

/**
 * Отчёт прогона - последние слова модели той же разметкой, что лента разговора; у сбоя - почему,
 * у пропуска - чем помешали, у идущего - что работа идёт.
 */
export const RunReport = ({ run }: RunPartProps) => {
  const { t } = useTranslation()
  const log = useConversationLog()
  const plain = <div className={styles.text}>{run.report}</div>

  return (
    <>
      {run.skip && <div className={styles.text}>{t(`tasks.skips.${run.skip}`)}</div>}
      {run.failure && (
        <div className={styles.failure}>
          {t(`tasks.failures.${run.failure}`)}
          {run.detail && ` ${run.detail}`}
        </div>
      )}
      {run.report ? (
        log ? (
          <Suspense fallback={plain}>
            <log.Text text={run.report} />
          </Suspense>
        ) : (
          plain
        )
      ) : isRunLive(run.state) ? (
        <div className={styles.empty}>
          <Spinner size="sm" tone="neutral" />
          {t('tasks.run.working')}
        </div>
      ) : (
        !run.skip && !run.failure && <div className={styles.empty}>{t('tasks.run.noReport')}</div>
      )}
    </>
  )
}

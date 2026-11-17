import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { isRunLive } from '@shared/tasks'

import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../TaskRunModal.module.scss'
import type { RunPartProps } from '../TaskRunModal.types'
import { useLogScroll } from '../../../../lib/log-scroll.hooks'
import { useConversationLog } from '../../../../state/conversation-log.context'
import { useTaskLog } from '../../../../state/tasks.queries'

/**
 * Разговор прогона целиком - той же лентой, что в панели провайдера, только для чтения (её даёт
 * workbench через ConversationLogContext). Идущий перечитывается сам.
 */
export const RunLog = ({ run }: RunPartProps) => {
  const { t } = useTranslation()
  const log = useConversationLog()
  const { data, isLoading } = useTaskLog(run.id, isRunLive(run.state))
  const feed = data?.found ? data.feed : null
  const { rootRef } = useLogScroll(feed?.items)

  return (
    <div ref={rootRef} className={styles.log}>
      {isLoading ? (
        <div className={styles.empty}>
          <Spinner size="sm" tone="neutral" />
          {t('tasks.run.loading')}
        </div>
      ) : !feed || !log ? (
        <div className={styles.empty}>{t('tasks.run.missing')}</div>
      ) : (
        <Suspense fallback={<Spinner size="sm" tone="neutral" />}>
          <log.Feed feed={feed} folder={run.projectPath} speaker="person" />
        </Suspense>
      )}
    </div>
  )
}

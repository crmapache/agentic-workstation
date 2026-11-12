import { useMemo, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../AiJobModal.module.scss'
import type { AiJobPartProps } from '../AiJobModal.types'
import { jobLogFeed } from '../../ai-job.utils'
import { useAiJobFeed } from '../../connectors.queries'
import { useLogScroll } from '../../../../lib/log-scroll.hooks'
import { useConversationLog } from '../../../../state/conversation-log.context'
import { AiJobState } from './AiJobState'

/**
 * Разговор работы той же лентой, что в панели Claude Code (её даёт workbench): что человек
 * просил, что ИИ искал и читал, что ответил. Держится у конца, пока растёт; под ним - что ИИ
 * делает сейчас.
 */
export const AiJobLog = ({ job }: AiJobPartProps) => {
  const { t } = useTranslation()
  const log = useConversationLog()
  const { data, isLoading, loadEarlier } = useAiJobFeed(job.id)
  const feed = useMemo(() => (data ? jobLogFeed(data) : null), [data])
  const { rootRef, holdPlace } = useLogScroll(feed?.items)

  const handleLoadEarlier = () => {
    holdPlace()
    void loadEarlier()
  }

  const loading = (
    <div className={styles.state}>
      <Spinner size="sm" tone="neutral" />
      <span className={styles.activity}>{t('connectors.ai.loading')}</span>
    </div>
  )

  return (
    <div ref={rootRef} className={styles.log}>
      {isLoading
        ? loading
        : feed &&
          log && (
            <Suspense fallback={loading}>
              <log.Feed feed={feed} folder="" speaker="person" onLoadEarlier={handleLoadEarlier} />
            </Suspense>
          )}
      <AiJobState job={job} />
    </div>
  )
}

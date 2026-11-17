import { Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { isRunLive } from '@shared/tasks'

import { Spinner } from '@agentic-workstation/ui/Spinner'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import styles from '../TaskRunModal.module.scss'
import type { RunLogProps } from '../TaskRunModal.types'
import { useLogScroll } from '../../../../lib/log-scroll.hooks'
import { useConversationLog } from '../../../../state/conversation-log.context'
import { useTaskLog } from '../../../../state/tasks.queries'

/**
 * Разговор прогона целиком - той же лентой, что в панели провайдера, только для чтения (её даёт
 * workbench через ConversationLogContext). Идущий перечитывается сам. У поручения с несколькими
 * главами сверху - выбор главы: прежние разговоры закрыты, но читаются.
 */
export const RunLog = ({ run, life }: RunLogProps) => {
  const { t } = useTranslation()
  const log = useConversationLog()
  const past = life?.chapters.length ?? 0
  const [chapter, setChapter] = useState(past)
  const { data, isLoading } = useTaskLog(
    run.id,
    isRunLive(run.state),
    chapter < past ? chapter : null,
  )
  const feed = data?.found ? data.feed : null
  const { rootRef } = useLogScroll(feed?.items)

  const chapters = Array.from({ length: past + 1 }, (_, index) => ({
    id: String(index),
    label: t('tasks.run.chapter', { number: index + 1 }),
  }))

  return (
    <div ref={rootRef} className={styles.log}>
      {past > 0 && (
        <div className={styles.picker}>
          <Tabs
            label={t('tasks.run.chapters')}
            items={chapters}
            value={String(Math.min(chapter, past))}
            onChange={(id: string) => setChapter(Number(id))}
          />
        </div>
      )}
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

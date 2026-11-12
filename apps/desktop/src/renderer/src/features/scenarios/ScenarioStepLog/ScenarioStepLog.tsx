import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@agentic-workstation/ui/Spinner'

import { useLogScroll } from '../../../lib/log-scroll.hooks'
import { useConversationLog } from '../../../state/conversation-log.context'
import { useStepLog } from './ScenarioStepLog.hooks'
import styles from './ScenarioStepLog.module.scss'
import type { ScenarioStepLogProps } from './ScenarioStepLog.types'
import { speakerOf } from './ScenarioStepLog.utils'
import { PlainLog } from './parts/PlainLog'

/**
 * Журнал шага (StepLog в ACC) на месте таймлайна в окне прогона: шаг - обычный разговор CLI, и
 * честно показать, что он сделал, - показать его как разговор, той же лентой, что в панели
 * провайдера (её даёт workbench через ConversationLogContext; нет - текст как есть). Тем же
 * видом открывается и разговор главного потока.
 */
export const ScenarioStepLog = ({ place, run, logKey }: ScenarioStepLogProps) => {
  const { t } = useTranslation()
  const log = useConversationLog()
  const { data, isLoading, loadEarlier } = useStepLog(place, run, logKey)
  const feed = data?.found ? data.feed : null
  const { rootRef, holdPlace } = useLogScroll(feed?.items)
  const speaker = speakerOf(logKey)

  const handleLoadEarlier = () => {
    holdPlace()
    void loadEarlier()
  }

  const plain = feed && <PlainLog feed={feed} speaker={speaker} onLoadEarlier={handleLoadEarlier} />

  return (
    <div ref={rootRef} className={styles.scenarioStepLog}>
      {isLoading ? (
        <div className={styles.empty}>
          <Spinner size="sm" tone="neutral" />
          {t('scenarios.run.log.loading')}
        </div>
      ) : !feed || feed.items.length === 0 ? (
        <div className={styles.empty}>{t('scenarios.run.log.missing')}</div>
      ) : log ? (
        <Suspense fallback={plain}>
          <log.Feed
            feed={feed}
            folder={run.cwd || run.projectPath}
            speaker={speaker}
            onLoadEarlier={handleLoadEarlier}
          />
        </Suspense>
      ) : (
        plain
      )}
    </div>
  )
}

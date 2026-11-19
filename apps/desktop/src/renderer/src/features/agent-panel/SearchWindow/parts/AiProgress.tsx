import clsx from 'clsx'
import { Check, Ellipsis } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../SearchWindow.module.scss'
import type { AiProgressProps } from '../SearchWindow.types'
import { STEPS_SHOWN, SEARCH_ICON_SIZE, SEARCH_ICON_STROKE } from '../../search.constants'

/**
 * Что модель делает, пока ищет: прогон длится 10-25 секунд, и кольцо над «Reading the
 * conversations…» столько времени не отличить от зависшего. Шаг - видом и предметом
 * (что искала, какой разговор открыла), последний - текущий, старые свёрнуты в «+ N».
 */
export const AiProgress = ({ steps, seconds }: AiProgressProps) => {
  const { t } = useTranslation()
  const tail = steps.slice(-STEPS_SHOWN)
  const hidden = steps.length - tail.length

  return (
    <div className={styles.progress} role="status">
      <div className={styles.progressHead}>
        <Spinner tone="neutral" />
        <span className={styles.progressText}>{t('agentPanel.search.aiSearching')}</span>
        <span className={styles.progressMeta}>
          {t('agentPanel.search.stepsMeta', {
            steps: t('agentPanel.search.steps.count', { count: steps.length }),
            seconds,
          })}
        </span>
      </div>
      <div className={styles.steps}>
        {hidden > 0 && (
          <span className={styles.stepPast}>
            {t('agentPanel.search.steps.more', { count: hidden })}
          </span>
        )}
        {tail.map((step, index) => {
          const isCurrent = index === tail.length - 1
          const Mark = isCurrent ? Ellipsis : Check

          return (
            <span
              key={`${hidden + index}-${step.subject}`}
              className={clsx(styles.step, isCurrent && styles.stepNow)}>
              <Mark size={SEARCH_ICON_SIZE} strokeWidth={SEARCH_ICON_STROKE} aria-hidden />
              {step.kind === 'grep' || step.kind === 'read'
                ? t(`agentPanel.search.steps.${step.kind}`, {
                    subject: step.subject || t('agentPanel.search.untitled'),
                  })
                : t(`agentPanel.search.steps.${step.kind}`)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

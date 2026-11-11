import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'

import { useNow } from '../clock.hooks'
import { USAGE_TICK_MS, USAGE_STALE_MS } from '../usage.constants'
import {
  usageTone,
  windowLabel,
  windowPercent,
  formatRemaining,
  availableAgainAt,
} from '../usage.utils'
import styles from './UsageWindows.module.scss'
import type { UsageWindowsProps } from './UsageWindows.types'

/**
 * Лимиты аккаунта строками: окно, полоса, процент и когда сбросится. Под ними - доплата,
 * когда аккаунт упёрся, снова примет работу, и как давно сняты цифры, если сервер давно
 * не отвечал. Окно, чей сброс прошёл, - пустое: новое окно, а не вчерашние цифры.
 */
export const UsageWindows = ({ usage }: UsageWindowsProps) => {
  const { t } = useTranslation()
  const now = useNow(true, USAGE_TICK_MS)
  const again = availableAgainAt(usage, now)
  const age = now - usage.fetchedAt

  return (
    <div className={styles.usageWindows}>
      <div className={styles.grid}>
        {usage.windows.map((window) => {
          const percent = windowPercent(window, now)
          const tone = usageTone(percent, window.severity)
          const label = windowLabel(window, t)
          const resetsIn = window.resetsAt !== null ? window.resetsAt - now : 0

          return (
            <div key={`${window.group}:${window.model}`} className={styles.row}>
              <span className={styles.label}>{label}</span>
              <span className={styles.bar}>
                <ProgressBar value={Math.min(1, percent / 100)} tone={tone} label={label} />
              </span>
              <span className={clsx(styles.percent, styles[tone])}>
                {t('claudeCode.usage.percent', { value: Math.round(percent) })}
              </span>
              <span className={styles.reset}>
                {resetsIn > 0 &&
                  t('claudeCode.usage.resetsIn', { time: formatRemaining(resetsIn) })}
              </span>
            </div>
          )
        })}
      </div>
      {usage.extra && (
        <div className={styles.note}>
          {usage.extra.percent === null
            ? t('claudeCode.usage.extra')
            : t('claudeCode.usage.extraPercent', { value: Math.round(usage.extra.percent) })}
        </div>
      )}
      {again !== null && (
        <div className={styles.alert}>
          {t('claudeCode.usage.backIn', { time: formatRemaining(again - now) })}
        </div>
      )}
      {age > USAGE_STALE_MS && (
        <div className={styles.note}>
          {t('claudeCode.usage.updated', { time: formatRemaining(age) })}
        </div>
      )}
    </div>
  )
}

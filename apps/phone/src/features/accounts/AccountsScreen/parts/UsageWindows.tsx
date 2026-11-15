import { useTranslation } from 'react-i18next'

import type { AccountWire } from '@agentic-workstation/remote-protocol/machine-wire-types'
import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'

import styles from '../AccountsScreen.module.scss'
import { usageTone, usageShare, percentText, windowLabel } from '../AccountsScreen.utils'
import { useNow } from '../../../../lib/now.hooks'
import { momentText } from '../../../../lib/time.utils'

/**
 * Лимиты аккаунта: окно за окном - сколько израсходовано и когда сбросится, доплата сверх
 * тарифа и отказ лимита. Цифр нет (не вошёл, ещё не узнали) - ничего. Срок сброса - строкой
 * под полосой: рядом с процентом в ширину телефона он не влезал, и подпись окна ломалась надвое.
 */
export const UsageWindows = ({ account, offset }: { account: AccountWire; offset: number }) => {
  const { t } = useTranslation()
  const now = useNow(60_000)
  const { usage } = account

  return (
    <>
      {usage?.windows.map((window) => (
        <div key={`${window.group}|${window.model}`} className={styles.window}>
          <div className={styles.windowHead}>
            <span className={styles.windowLabel}>{windowLabel(t, window)}</span>
            <span className={styles.windowValue}>{percentText(window.percent)}</span>
          </div>
          <ProgressBar
            label={windowLabel(t, window)}
            value={usageShare(window.percent)}
            tone={usageTone(window.percent)}
          />
          {window.resetsAt !== null && (
            <span className={styles.windowReset}>
              {t('accounts.resets', { when: momentText(window.resetsAt, now) })}
            </span>
          )}
        </div>
      ))}
      {usage && usage.extra !== null && (
        <p className={styles.note}>{t('accounts.extra', { percent: percentText(usage.extra) })}</p>
      )}
      {account.refusedUntil !== null && (
        <p className={styles.warning}>
          {t('accounts.refusedUntil', { when: momentText(account.refusedUntil - offset, now) })}
        </p>
      )}
    </>
  )
}

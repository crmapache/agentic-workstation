import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { RingMeter } from '@agentic-workstation/ui/RingMeter'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../ComposerStatus.module.scss'
import { usePanelPrefs, useClaudeState } from '../../claude.queries'
import { useNow } from '../../clock.hooks'
import { USAGE_TICK_MS, PANEL_USAGE_REFRESH_MS } from '../../usage.constants'
import { useUsageRefresh } from '../../usage.hooks'
import { usageRings } from '../../usage.utils'

/**
 * Лимиты аккаунта разговоров справа под полем, как в ACC: все окна в ряд (пять часов,
 * неделя, неделя модели) - кольцо и процент цветом темпа, без подписи. Что за окно и когда
 * сбросится - в подсказке своего кольца. Горящее (идёт доплата) - без процента: он застрял
 * на ста. Пока цифр нет - ничего: пустые кольца только отвлекали бы. Кольцо, спрятанное в
 * Settings → Usage meters, не рисуется.
 */
export const UsageRings = () => {
  const { t } = useTranslation()
  const { data: state } = useClaudeState()
  const { hiddenMeters } = usePanelPrefs()
  const now = useNow(true, USAGE_TICK_MS)
  const current = state?.accounts.current ?? ''

  useUsageRefresh(state ? [current] : [], PANEL_USAGE_REFRESH_MS)

  const usage = state?.accounts.usage[current]

  if (!usage) return null

  const rings = usageRings(usage, now, t).filter((ring) => !hiddenMeters.includes(ring.key))

  return rings.map((ring) => (
    <Tooltip key={ring.key} label={ring.label} details={ring.details} placement="top">
      <span className={styles.meter} role="img" tabIndex={0} aria-label={ring.hint}>
        <RingMeter
          value={ring.value}
          pace={ring.pace}
          tone={ring.tone}
          burning={ring.burning}
          label={ring.hint}
        />
        {!ring.burning && (
          <span className={clsx(styles.meterValue, styles[ring.tone])}>
            {t('claudeCode.usage.percent', { value: Math.round(ring.value) })}
          </span>
        )}
      </span>
    </Tooltip>
  ))
}

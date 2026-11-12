import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { DELTA_ICONS, DELTA_ICON_SIZE, DELTA_ICON_STROKE } from '../StatisticsView.constants'
import styles from '../StatisticsView.module.scss'
import type { DeltaMarkProps } from '../StatisticsView.types'
import { formatDeltaPercent } from '../../statistics-format.utils'
import { deltaOf } from '../../statistics-period.utils'

/**
 * Изменение против прошлого периода: стрелка и процент цветом вторичного текста. Рост и
 * падение здесь не «хорошо» и не «плохо» (больше токенов - и больше сделано, и дороже),
 * поэтому без зелёного и красного. Под рукой - само прошлое число.
 */
export const DeltaMark = ({ compare, period }: DeltaMarkProps) => {
  const { t } = useTranslation()
  const delta = deltaOf(compare.current, compare.previous)

  if (!delta || compare.previous === null) return null

  const Icon = DELTA_ICONS[delta.direction]
  const text =
    delta.percent === null
      ? t('statistics.delta.new')
      : delta.direction === 'flat'
        ? t('statistics.delta.flat')
        : formatDeltaPercent(delta)
  const hint = t(`statistics.delta.previous.${period}`, {
    value: compare.format(compare.previous),
  })

  return (
    <Tooltip label={hint}>
      <span className={styles.delta} aria-label={`${text}. ${hint}`} role="img">
        <Icon size={DELTA_ICON_SIZE} strokeWidth={DELTA_ICON_STROKE} aria-hidden />
        {text}
      </span>
    </Tooltip>
  )
}

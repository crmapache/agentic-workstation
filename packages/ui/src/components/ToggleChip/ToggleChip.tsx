import clsx from 'clsx'

import { Tooltip } from '../Tooltip/Tooltip'
import styles from './ToggleChip.module.scss'
import type { ToggleChipProps } from './ToggleChip.types'

/**
 * Плашка-переключатель в ряду таких же: выбор нескольких из набора (проекты, где виден
 * коннектор). Включённая залита, выключенная - пунктир и тише. Ряд переносится. Одна
 * настройка с подписью и пояснением - Switch; один вариант из нескольких - Tabs.
 */
export const ToggleChip = ({ label, pressed, leading, hint, onChange }: ToggleChipProps) => {
  const chip = (
    <button
      type="button"
      aria-pressed={pressed}
      className={clsx(
        styles.chip,
        pressed && styles.pressed,
        Boolean(leading) && styles.withLeading,
      )}
      onClick={() => onChange(!pressed)}>
      {leading && <span className={styles.leading}>{leading}</span>}
      <span className={styles.label}>{label}</span>
    </button>
  )

  return hint ? <Tooltip label={hint}>{chip}</Tooltip> : chip
}

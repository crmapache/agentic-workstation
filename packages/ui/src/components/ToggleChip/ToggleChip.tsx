import clsx from 'clsx'

import { Tooltip } from '../Tooltip/Tooltip'
import styles from './ToggleChip.module.scss'
import type { ToggleChipProps } from './ToggleChip.types'

/**
 * Плашка-переключатель в ряду таких же: выбор нескольких из набора (проекты, где виден
 * коннектор). Включённая залита, выключенная - пунктир и тише. Ряд переносится. Одна
 * настройка с подписью и пояснением - Switch; один вариант из нескольких - Tabs. sm - в
 * плотной строке под полем ввода, рядом с тихим индикатором (пресеты); touch с fill - те же
 * пресеты под палец на телефоне, ряд поровну.
 */
export const ToggleChip = ({
  label,
  pressed,
  leading,
  hint,
  hintPlacement,
  size = 'md',
  fill = false,
  onChange,
}: ToggleChipProps) => {
  const chip = (
    <button
      type="button"
      aria-pressed={pressed}
      className={clsx(
        styles.chip,
        styles[size],
        pressed && styles.pressed,
        fill && styles.fill,
        Boolean(leading) && styles.withLeading,
      )}
      onClick={() => onChange(!pressed)}>
      {leading && <span className={styles.leading}>{leading}</span>}
      <span className={styles.label}>{label}</span>
    </button>
  )

  return hint ? (
    <Tooltip label={hint} placement={hintPlacement}>
      {chip}
    </Tooltip>
  ) : (
    chip
  )
}

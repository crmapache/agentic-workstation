import clsx from 'clsx'

import styles from '../DatePicker.module.scss'
import type { DayCellProps } from '../DatePicker.types'

/**
 * День сетки: число дня кнопкой. Выбранный - заливкой, дни полосы перед ним - тише, сегодня -
 * числом тона акцента, чужой месяц - тусклее. В Tab встаёт только день под курсором, по
 * остальным ходят стрелками.
 */
export const DayCell = ({
  day,
  outside,
  selected,
  inSpan,
  today,
  disabled,
  focusable,
  label,
  onSelect,
}: DayCellProps) => (
  <button
    type="button"
    role="gridcell"
    data-day={day}
    tabIndex={focusable ? 0 : -1}
    disabled={disabled}
    aria-selected={selected}
    aria-current={today ? 'date' : undefined}
    aria-label={label}
    className={clsx(
      styles.day,
      outside && styles.outside,
      inSpan && styles.inSpan,
      selected && styles.selected,
      today && styles.today,
    )}
    onClick={() => onSelect(day)}>
    {new Date(day).getDate()}
  </button>
)

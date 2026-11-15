import { ChevronLeft, ChevronRight } from 'lucide-react'

import { IconButton } from '../IconButton/IconButton'
import { useDayCursor } from './DatePicker.hooks'
import styles from './DatePicker.module.scss'
import type { DatePickerProps } from './DatePicker.types'
import { addDays, monthGridOf, monthStartOf } from './DatePicker.utils'
import { DayCell } from './parts/DayCell'

/**
 * Календарь месяца для выбора дня: сетка шести недель с понедельника, стрелки месяцев в
 * шапке, стрелки клавиатуры по дням. span подсвечивает отрезок, который кончается выбранным
 * днём (неделя, 30 дней). Дни за min и max недоступны. Обычно стоит во всплывающей панели
 * под кнопкой с датой; подписи месяцев и дней приходят пропсами.
 */
export const DatePicker = ({
  value,
  onChange,
  span = 1,
  today,
  min,
  max,
  monthLabel,
  dayLabel,
  weekdayLabels,
  previousMonthLabel,
  nextMonthLabel,
  autoFocus,
}: DatePickerProps) => {
  const { gridRef, cursor, month, handleKeyDown, showMonth } = useDayCursor({
    value,
    min,
    max,
    autoFocus,
  })

  const spanStart = addDays(value, 1 - span)
  const hasPrevious = min === undefined || monthStartOf(min) < month
  const hasNext = max === undefined || monthStartOf(max) > month

  return (
    <div className={styles.datePicker}>
      <div className={styles.header}>
        <IconButton
          icon={ChevronLeft}
          label={previousMonthLabel}
          size="sm"
          disabled={!hasPrevious}
          onClick={() => showMonth(-1)}
        />
        <span className={styles.month} aria-live="polite">
          {monthLabel(month)}
        </span>
        <IconButton
          icon={ChevronRight}
          label={nextMonthLabel}
          size="sm"
          disabled={!hasNext}
          onClick={() => showMonth(1)}
        />
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={monthLabel(month)}
        className={styles.grid}
        onKeyDown={handleKeyDown}>
        <div role="row" className={styles.row}>
          {weekdayLabels.map((weekday, index) => (
            <span key={index} role="columnheader" className={styles.weekday}>
              {weekday}
            </span>
          ))}
        </div>
        {monthGridOf(month).map((week) => (
          <div key={week[0]} role="row" className={styles.row}>
            {week.map((day) => (
              <DayCell
                key={day}
                day={day}
                outside={monthStartOf(day) !== month}
                selected={day === value}
                inSpan={day >= spanStart && day < value}
                today={day === today}
                disabled={(min !== undefined && day < min) || (max !== undefined && day > max)}
                focusable={day === cursor}
                label={dayLabel(day)}
                onSelect={onChange}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

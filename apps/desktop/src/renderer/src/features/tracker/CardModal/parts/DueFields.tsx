import { X, Clock, CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { DateField } from '@agentic-workstation/ui/DateField'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { TimeField } from '@agentic-workstation/ui/TimeField'

import { MINUTE_STEP, DEFAULT_TIME } from '../CardModal.constants'
import styles from '../CardModal.module.scss'
import type { DueFieldsProps } from '../CardModal.types'
import { timeOf, dueDayOf, dateOfDay, minutesOf } from '../../tracker.utils'
import {
  fullDayLabel,
  weekdayNames,
  monthYearLabel,
  weekdayDayLabel,
} from '../../../../lib/dates.utils'

/** Срок карточки: день и, если нужно, время; оба убираются крестиком. */
export const DueFields = ({ form, today }: DueFieldsProps) => {
  const { t } = useTranslation()
  const { due } = form

  if (!due)
    return (
      <div className={styles.row}>
        <Button
          variant="dashed"
          size="sm"
          icon={CalendarDays}
          onClick={() => form.set('due', { date: dateOfDay(today), time: null })}>
          {t('tracker.cardModal.addDate')}
        </Button>
      </div>
    )

  const day = dueDayOf(due)

  return (
    <div className={styles.row}>
      <DateField
        label={t('tracker.cardModal.date')}
        valueLabel={weekdayDayLabel(day)}
        value={day}
        today={today}
        monthLabel={monthYearLabel}
        dayLabel={fullDayLabel}
        weekdayLabels={weekdayNames()}
        previousMonthLabel={t('tracker.cardModal.previousMonth')}
        nextMonthLabel={t('tracker.cardModal.nextMonth')}
        onChange={(next) => form.set('due', { ...due, date: dateOfDay(next) })}
      />
      <IconButton
        icon={X}
        label={t('tracker.cardModal.clearDate')}
        onClick={() => form.set('due', null)}
      />
      {due.time === null ? (
        <Button
          variant="ghost"
          size="sm"
          icon={Clock}
          onClick={() => form.set('due', { ...due, time: DEFAULT_TIME })}>
          {t('tracker.cardModal.addTime')}
        </Button>
      ) : (
        <>
          <TimeField
            label={t('tracker.cardModal.time')}
            hourLabel={t('tracker.cardModal.hour')}
            minuteLabel={t('tracker.cardModal.minute')}
            value={minutesOf(due.time)}
            minuteStep={MINUTE_STEP}
            onChange={(minutes) => form.set('due', { ...due, time: timeOf(minutes) })}
          />
          <IconButton
            icon={X}
            label={t('tracker.cardModal.clearTime')}
            onClick={() => form.set('due', { ...due, time: null })}
          />
        </>
      )}
    </div>
  )
}

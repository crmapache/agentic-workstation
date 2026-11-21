import { X, Clock, CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { DateField } from '@agentic-workstation/ui/DateField'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { TimeField } from '@agentic-workstation/ui/TimeField'

import { MINUTE_STEP, DEFAULT_TIME } from '../CardModal.constants'
import styles from '../CardModal.module.scss'
import type { DueFieldsProps } from '../CardModal.types'
import { dueDayOf, minutesOf } from '../../tracker.utils'
import {
  isoDay,
  fullDayLabel,
  weekdayNames,
  clockOfMinutes,
  monthYearLabel,
  weekdayDayLabel,
} from '../../../../lib/dates.utils'

/** Срок карточки: день и, если нужно, время; оба убираются крестиком. */
export const DueFields = ({ form, today }: DueFieldsProps) => {
  const { t } = useTranslation()
  const { due } = form

  const handleAddDate = () => form.set('due', { date: isoDay(today), time: null })
  const handleDate = (next: number) => {
    if (due) form.set('due', { ...due, date: isoDay(next) })
  }
  // Без срока повторять нечего: снятый срок снимает и повтор, как у главного процесса.
  const handleClearDate = () => {
    form.set('due', null)
    form.set('repeat', null)
  }
  const handleAddTime = () => {
    if (due) form.set('due', { ...due, time: DEFAULT_TIME })
  }
  const handleTime = (minutes: number) => {
    if (due) form.set('due', { ...due, time: clockOfMinutes(minutes) })
  }
  const handleClearTime = () => {
    if (due) form.set('due', { ...due, time: null })
  }

  if (!due)
    return (
      <div className={styles.row}>
        <Button variant="dashed" size="sm" icon={CalendarDays} onClick={handleAddDate}>
          {t('tracker.cardModal.addDate')}
        </Button>
      </div>
    )

  // Срок не датой главный процесс не пропускает; пришёл всё же - подпись как записана, а
  // календарь открывается на сегодня, а не на 1970-м.
  const day = dueDayOf(due)

  return (
    <div className={styles.row}>
      <DateField
        label={t('tracker.cardModal.date')}
        valueLabel={day === null ? due.date : weekdayDayLabel(day)}
        value={day ?? today}
        today={today}
        monthLabel={monthYearLabel}
        dayLabel={fullDayLabel}
        weekdayLabels={weekdayNames()}
        previousMonthLabel={t('tracker.cardModal.previousMonth')}
        nextMonthLabel={t('tracker.cardModal.nextMonth')}
        onChange={handleDate}
      />
      <IconButton icon={X} label={t('tracker.cardModal.clearDate')} onClick={handleClearDate} />
      {due.time === null ? (
        <Button variant="ghost" size="sm" icon={Clock} onClick={handleAddTime}>
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
            onChange={handleTime}
          />
          <IconButton icon={X} label={t('tracker.cardModal.clearTime')} onClick={handleClearTime} />
        </>
      )}
    </div>
  )
}

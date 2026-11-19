import { useTranslation } from 'react-i18next'

import { nextDue } from '@shared/task-clock'
import { TASK_REPEATS } from '@shared/tasks'
import type { TaskRepeat } from '@shared/tasks'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'
import { DateField } from '@agentic-workstation/ui/DateField'
import { Tabs } from '@agentic-workstation/ui/Tabs'
import { TimeField } from '@agentic-workstation/ui/TimeField'
import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import styles from '../TaskModal.module.scss'
import type { ScheduleFieldsProps } from '../TaskModal.types'
import { WEEKDAYS, MONTH_DAYS, HOURLY_STEP, CLOCK_TICK_MS } from '../../tasks.constants'
import { useTaskWords } from '../../tasks.hooks'
import { scheduleOf } from '../../tasks.utils'
import {
  fullDayLabel,
  weekdayNames,
  monthYearLabel,
  weekdayDayLabel,
} from '../../../../lib/dates.utils'
import { useNow } from '../../../../lib/now.hooks'

/**
 * Ритм задания: вкладками - вручную, один раз, каждый час, день, по дням недели, раз в месяц;
 * под ними - то, что этому ритму нужно (день, дни недели, число месяца, время). Внизу - когда
 * задание пойдёт в следующий раз, тем же счётом, что у главного процесса.
 */
export const ScheduleFields = ({ schedule, onChange }: ScheduleFieldsProps) => {
  const { t } = useTranslation()
  const words = useTaskWords()
  const now = useNow(true, CLOCK_TICK_MS)
  const names = weekdayNames()
  const today = new Date(now).setHours(0, 0, 0, 0)
  const due = nextDue(scheduleOf(schedule), now)
  const repeats = TASK_REPEATS.map((id) => ({ id, label: t(`tasks.form.repeats.${id}`) }))
  const monthDays = MONTH_DAYS.map((day) => ({
    value: String(day),
    label: day === MONTH_DAYS.length ? t('tasks.form.lastDay') : String(day),
  }))
  const time = {
    label: t('tasks.form.at'),
    hourLabel: t('tasks.form.hour'),
    minuteLabel: t('tasks.form.minute'),
  }
  const { repeat } = schedule

  const handleDay = (day: number) => (pressed: boolean) =>
    onChange({
      ...schedule,
      days: pressed ? [...schedule.days, day].sort() : schedule.days.filter((one) => one !== day),
    })

  return (
    <>
      <div className={styles.field}>
        <span className={styles.caption} aria-hidden>
          {t('tasks.form.repeat')}
        </span>
        <div className={styles.picker}>
          <Tabs
            label={t('tasks.form.repeat')}
            items={repeats}
            value={repeat}
            onChange={(next: TaskRepeat) => onChange({ ...schedule, repeat: next })}
          />
        </div>
      </div>
      {repeat === 'weekly' && (
        <div className={styles.field}>
          <span className={styles.caption}>{t('tasks.form.days')}</span>
          <div className={styles.days}>
            {WEEKDAYS.map((day) => (
              <ToggleChip
                key={day}
                label={names[day - 1] ?? ''}
                pressed={schedule.days.includes(day)}
                onChange={handleDay(day)}
              />
            ))}
          </div>
        </div>
      )}
      {repeat !== 'manual' && (
        <div className={styles.row}>
          {repeat === 'once' && (
            <DateField
              label={t('tasks.form.date')}
              valueLabel={weekdayDayLabel(schedule.day)}
              value={schedule.day}
              today={today}
              min={today}
              monthLabel={monthYearLabel}
              dayLabel={fullDayLabel}
              weekdayLabels={names}
              previousMonthLabel={t('inbox.dates.previousMonth')}
              nextMonthLabel={t('inbox.dates.nextMonth')}
              onChange={(day) => onChange({ ...schedule, day })}
            />
          )}
          {repeat === 'monthly' && (
            <ChoiceField
              label={t('tasks.form.monthDay')}
              value={String(schedule.monthDay)}
              options={monthDays}
              onPick={(day) => onChange({ ...schedule, monthDay: Number(day) })}
            />
          )}
          <TimeField
            {...time}
            value={schedule.at}
            minutesOnly={repeat === 'hourly'}
            minuteStep={repeat === 'hourly' ? HOURLY_STEP : undefined}
            onChange={(at) => onChange({ ...schedule, at })}
          />
        </div>
      )}
      <span className={styles.note}>
        {due ? t('tasks.form.next', { when: words.moment(due, now) }) : t('tasks.form.noNext')}
      </span>
    </>
  )
}

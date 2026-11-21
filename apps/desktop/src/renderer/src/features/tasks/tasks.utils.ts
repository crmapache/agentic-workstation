import { DEFAULT_GOAL } from '@shared/goals'
import { parseDay } from '@shared/task-clock'
import type { Task, TaskDraft, TaskSchedule } from '@shared/tasks'
import { LAST_MONTH_DAY } from '@shared/tasks'

import { pad2, isoDay, clockOfMinutes } from '../../lib/dates.utils'
import { WORK_DAYS } from './tasks.constants'
import type { ScheduleForm, ScheduleWords, ScheduleValues } from './tasks.types'

const sameDays = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((day) => right.includes(day))

/**
 * Ритм словами для строки задания: ключ i18n и подстановки. Неделя со всеми днями - «каждый
 * день», с буднями - «Weekdays», 31-е число - «последний день месяца».
 */
export const scheduleWords = (
  schedule: TaskSchedule,
  weekdayName: (day: number) => string,
  dayLabel: (day: number) => string,
): ScheduleWords => {
  const time = clockOfMinutes(schedule.at)
  const values = (patch: Partial<ScheduleValues>): ScheduleValues => ({
    time,
    date: '',
    minute: '',
    day: '',
    days: '',
    ...patch,
  })

  switch (schedule.repeat) {
    case 'manual':
      return { key: 'manual', values: values({}) }
    case 'once': {
      const day = parseDay(schedule.date)

      return {
        key: 'once',
        values: values({ date: day ? dayLabel(day.getTime()) : schedule.date }),
      }
    }
    case 'hourly':
      return { key: 'hourly', values: values({ minute: pad2(schedule.at % 60) }) }
    case 'daily':
      return { key: 'daily', values: values({}) }
    case 'weekly':
      if (schedule.days.length === 0 || schedule.days.length === 7) {
        return { key: 'everyDay', values: values({}) }
      }

      if (sameDays(schedule.days, WORK_DAYS)) return { key: 'weekdays', values: values({}) }

      return { key: 'weekly', values: values({ days: schedule.days.map(weekdayName).join(', ') }) }
    case 'monthly':
      return schedule.monthDay >= LAST_MONTH_DAY
        ? { key: 'monthlyLast', values: values({}) }
        : { key: 'monthly', values: values({ day: String(schedule.monthDay) }) }
  }
}

/** Ритм формы: день разового запуска - местной полночью (завтра, если дня нет). */
export const formOf = (schedule: TaskSchedule, now: number): ScheduleForm => {
  const tomorrow = new Date(now)

  tomorrow.setHours(0, 0, 0, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)

  return { ...schedule, day: parseDay(schedule.date)?.getTime() ?? tomorrow.getTime() }
}

/** Ритм на сохранение: день формы - строкой. */
export const scheduleOf = ({ day, ...schedule }: ScheduleForm): TaskSchedule => ({
  ...schedule,
  date: schedule.repeat === 'once' ? isoDay(day) : schedule.date,
})

/**
 * Новое задание: папка - открытый проект (задание принадлежит ему), каждый день в девять,
 * вопросы - в уведомления; поручение - с подтверждением каждого сообщения людям.
 */
export const blankDraft = (projectPath: string): TaskDraft => ({
  id: null,
  kind: 'schedule',
  name: '',
  projectPath,
  prompt: '',
  schedule: { repeat: 'daily', at: 9 * 60, days: [...WORK_DAYS], monthDay: 1, date: '' },
  enabled: true,
  catchUp: true,
  report: true,
  // Провайдер, пока человек его не выбрал, форма считает при показе (effectiveProvider).
  provider: 'claude',
  model: '',
  effort: '',
  permissionMode: 'default',
  goal: DEFAULT_GOAL,
})

export const draftOf = ({
  createdAt: _c,
  updatedAt: _u,
  nextAt: _n,
  skipAt: _s,
  ...task
}: Task): TaskDraft => task

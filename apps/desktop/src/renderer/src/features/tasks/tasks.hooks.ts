import { useTranslation } from 'react-i18next'

import type { TaskSchedule } from '@shared/tasks'

import { momentLabel, weekdayNames, weekdayDayLabel } from '../../lib/dates.utils'
import { scheduleWords } from './tasks.utils'

/** Ритм и моменты словами окна: «Monthly on day 1 at 09:00», «Tomorrow 09:00». */
export const useTaskWords = () => {
  const { t } = useTranslation()
  const names = weekdayNames()

  const schedule = (value: TaskSchedule) => {
    const words = scheduleWords(value, (day) => names[day - 1] ?? '', weekdayDayLabel)

    return t(`tasks.schedule.${words.key}`, words.values)
  }

  const moment = (ms: number, now: number) =>
    momentLabel(ms, now, {
      today: t('inbox.nearDays.today'),
      tomorrow: t('inbox.nearDays.tomorrow'),
      yesterday: t('inbox.nearDays.yesterday'),
    })

  return { schedule, moment }
}

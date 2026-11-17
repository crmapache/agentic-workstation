import { useTranslation } from 'react-i18next'

import type { QueueHours } from '@shared/scenario-queues'

import { momentLabel, weekdayNames } from '../../lib/dates.utils'
import type { HoursNow, QueueRest } from './scenarios-queue-hours.utils'
import { daysWords, spanLabel } from './scenarios-queue-hours.utils'

/**
 * Рабочие часы очереди словами (ADR 0074) - одни на метку полосы, пункт меню, строку «вне
 * рабочих часов» и окно часов. Срок - «Tomorrow 10:00», как у заданий и уведомлений.
 */
export const useHoursWords = () => {
  const { t } = useTranslation()
  const names = weekdayNames()

  const moment = (ms: number, now: number) =>
    momentLabel(ms, now, {
      today: t('inbox.nearDays.today'),
      tomorrow: t('inbox.nearDays.tomorrow'),
      yesterday: t('inbox.nearDays.yesterday'),
    })

  /** «Weekdays 10:00-19:00», «Weekends all day». */
  const label = (hours: QueueHours): string => {
    const days = daysWords(hours.days, (day) => names[day - 1] ?? '')

    return t('scenarios.queues.hours.label', {
      days: t(`scenarios.queues.hours.days.${days.key}`, { days: days.days }),
      span: spanLabel(hours) ?? t('scenarios.queues.hours.allDay'),
    })
  }

  /** Что часы сделают, если сохранить их сейчас. */
  const now = (note: HoursNow, at: number): string =>
    note.kind === 'noDays' || note.kind === 'always'
      ? t(`scenarios.queues.hours.now.${note.kind}`)
      : t(`scenarios.queues.hours.now.${note.kind}`, { when: moment(note.until, at) })

  /**
   * Почему спящая очередь стоит. Срок прошёл, а она спит - ждёт, пока в папке проекта доработает
   * сценарий другой очереди (или ближайшего удара часов).
   */
  const rest = (why: QueueRest, at: number): string =>
    why.until <= at
      ? t('scenarios.queues.hours.rest.folder')
      : t(`scenarios.queues.hours.rest.${why.kind}`, {
          name: why.kind === 'paused' ? why.name : '',
          when: moment(why.until, at),
        })

  return { label, now, rest }
}

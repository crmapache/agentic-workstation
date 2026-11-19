import { useTranslation } from 'react-i18next'

import type { GoalSummary } from '@shared/goals'
import { nextDue } from '@shared/task-clock'
import { isNextSkipped } from '@shared/tasks'
import type { Task, TaskRunState, TaskSchedule } from '@shared/tasks'

import { momentLabel, weekdayNames, weekdayDayLabel } from '../../lib/dates.utils'
import { scheduleWords } from './tasks.utils'

/**
 * Ритм, моменты и поручения словами окна: «Monthly on day 1 at 09:00», «Tomorrow 09:00»,
 * «Waiting: Corey's reply · next check 14:20».
 */
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

  /**
   * Ближайший срок задания по расписанию: «Next Today 09:00»; пропущенный - следующий за ним и
   * какой пропущен; выключенное - «Paused».
   */
  const next = (task: Pick<Task, 'enabled' | 'nextAt' | 'skipAt' | 'schedule'>, now: number) => {
    if (!task.enabled || !task.nextAt) return t('tasks.row.paused')
    if (!isNextSkipped(task)) return t('tasks.row.next', { when: moment(task.nextAt, now) })

    return t('tasks.row.nextSkipping', {
      when: moment(nextDue(task.schedule, task.nextAt), now),
      skipped: moment(task.nextAt, now),
    })
  }

  /**
   * Поручение строкой (ADR 0080): «Until done», работает, ждёт тебя или чего ждёт во сне - с
   * ближайшей проверкой и сроком пробуждения.
   */
  const goal = (life: GoalSummary | null, state: TaskRunState | null, now: number) => {
    const head = t('tasks.row.untilDone')

    if (!life || !state) return head
    if (state === 'running') return `${head} · ${t('tasks.row.working')}`
    if (state === 'waiting') return `${head} · ${t('tasks.row.waitingYou')}`
    if (state !== 'sleeping' || !life.wait) return head

    return [
      t('tasks.row.sleeping', { reason: life.wait.reason }),
      life.nextCheckAt ? t('tasks.row.nextCheck', { when: moment(life.nextCheckAt, now) }) : '',
      life.wait.until ? t('tasks.row.wakesAt', { when: moment(life.wait.until, now) }) : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return { schedule, moment, next, goal }
}

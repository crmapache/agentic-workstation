import type { TaskRunState } from '@shared/tasks'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

import type { TasksTab } from './tasks.types'

export const TASK_TABS: readonly TasksTab[] = ['tasks', 'runs']

/** Тон метки прогона: ждёт тебя - внимание, сбой - красный, готово - зелёный. */
export const STATE_TONES: Record<TaskRunState, BadgeTone> = {
  running: 'info',
  waiting: 'accent',
  done: 'success',
  failed: 'danger',
  stopped: 'neutral',
  skipped: 'neutral',
}

/** Как часто стареют «Next Today 09:00» и «Last run Yesterday». */
export const CLOCK_TICK_MS = 60_000

/** Дни недели формы - с понедельника, по ISO. */
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7]

/** Будни: «раз в неделю» с этими днями называется «Weekdays». */
export const WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5]

/** Дни месяца для «раз в месяц»: 31 - «последний день». */
export const MONTH_DAYS: readonly number[] = Array.from({ length: 31 }, (_, index) => index + 1)

/** Шаг минут у «каждый час»: :00, :15, :30, :45 и что стоит. */
export const HOURLY_STEP = 15

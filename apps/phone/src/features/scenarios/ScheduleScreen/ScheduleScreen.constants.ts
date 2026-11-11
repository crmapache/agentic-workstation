import type { ScheduleForm } from './ScheduleScreen.types'

/** Новый отложенный запуск: каждый день в девять, в своей worktree. */
export const DEFAULT_SCHEDULE: ScheduleForm = {
  time: '09:00',
  repeat: 'daily',
  weekday: 1,
  inputs: {},
  worktree: true,
  provider: '',
}

/** Дни недели по номеру протокола: 1 - понедельник. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

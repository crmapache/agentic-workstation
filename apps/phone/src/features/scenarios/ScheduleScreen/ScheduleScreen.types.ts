import type { SCHEDULE_REPEATS } from '@agentic-workstation/remote-protocol/scenario-commands'

export type ScheduleRepeat = (typeof SCHEDULE_REPEATS)[number]

/** Форма отложенного запуска: час полем времени («09:00»), ритм, день недели, ответы. */
export type ScheduleForm = {
  time: string
  repeat: ScheduleRepeat
  /** 1 - понедельник … 7 - воскресенье; нужен только еженедельному. */
  weekday: number
  inputs: Record<string, string>
  worktree: boolean
  provider: string
}

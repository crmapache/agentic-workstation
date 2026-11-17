import type { GoalLife } from '@shared/goals'
import type { TaskRun } from '@shared/tasks'

export type TaskRunModalProps = { runId: string }

/** Раздел окна прогона: поручение (его сон, журнал, история), отчёт или разговор целиком. */
export type RunSection = 'goal' | 'report' | 'log'

export type RunPartProps = { run: TaskRun }

/** Часть окна о жизни поручения: сама жизнь уже прочитана. */
export type GoalPartProps = { life: GoalLife; now: number }

export type RunLogProps = RunPartProps & { life: GoalLife | null }

export type RunGoalProps = GoalPartProps & {
  workUsd: number
  /** Жизнь не кончилась (идёт или спит): есть чего ждать. */
  open: boolean
}

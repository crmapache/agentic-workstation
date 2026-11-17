import type { TaskDraft } from '@shared/tasks'

import type { Choice, ScheduleForm } from '../tasks.types'

export type TaskModalProps = {
  /** Правка задания по id; null - новое. */
  taskId: string | null
}

export type ChoiceFieldProps = {
  label: string
  value: string
  choices: readonly Choice[]
  onPick: (value: string) => void
}

export type ScheduleFieldsProps = {
  schedule: ScheduleForm
  onChange: (schedule: ScheduleForm) => void
}

export type RunOptionsProps = {
  draft: TaskDraft
  onChange: (patch: Partial<TaskDraft>) => void
}

import type { TaskAuthorError } from '@shared/task-author'
import type { Task, TaskDraft } from '@shared/tasks'

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

export type GoalFieldsProps = RunOptionsProps

/** Вкладка нового задания: написать с ИИ или заполнить форму руками. */
export type TaskModalMode = 'ai' | 'form'

/** ИИ пишет задание: номер запроса (по нему отмена) и с какого момента ждём. */
export type AuthorWriting = { id: string; since: number }

/** Почему ИИ не написал: код для слов окна и, у отказа CLI, его слова. */
export type AuthorFailure = { error: TaskAuthorError; detail: string }

export type AuthorPaneProps = {
  description: string
  writing: AuthorWriting | null
  failure: AuthorFailure | null
  onDescribe: (description: string) => void
}

export type AuthorWaitProps = { since: number }

export type ProjectFieldProps = {
  /** Задание, как оно сохранено: его проект - откуда перенос. */
  task: Task
  value: string
  onPick: (projectPath: string) => void
}

export type FormPaneProps = {
  /** Сохранённое задание при правке; null - новое, его проект - открытый. */
  task: Task | null
  draft: TaskDraft
  schedule: ScheduleForm
  onChange: (patch: Partial<TaskDraft>) => void
  onChangeSchedule: (schedule: ScheduleForm) => void
}

import type { TaskSchedule } from '@shared/tasks'

/** Вкладка вида заданий: сами задания или их прогоны. */
export type TasksTab = 'tasks' | 'runs'

/** Окно правки: новое задание (null) или правка по id; undefined - закрыто. */
export type TaskEditing = string | null | undefined

/** Отказ главного процесса - код причины, текст у i18n. */
export type TasksNotice = { code: string }

/** Подстановки ритма словами: каждая есть всегда, ненужная ритму - пустая. */
export type ScheduleValues = {
  time: string
  date: string
  minute: string
  day: string
  days: string
}

/** Ритм словами: ключ i18n и подстановки. */
export type ScheduleWords = {
  key:
    | 'manual'
    | 'once'
    | 'hourly'
    | 'daily'
    | 'weekdays'
    | 'weekly'
    | 'everyDay'
    | 'monthly'
    | 'monthlyLast'
  values: ScheduleValues
}

/** Ритм, который держит форма: тот же TaskSchedule, но день разового запуска - местной полночью. */
export type ScheduleForm = TaskSchedule & { day: number }

/** Вариант списка в форме: значение и подпись. */
export type Choice = { value: string; label: string; description?: string | undefined }

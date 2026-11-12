import type { TimetableRow as Row } from '../scenarios-hours.utils'

/** Что делают со строкой расписания: поправить, удалить, запустить сейчас. */
export type TimetableRowActions = {
  onEdit: (row: Row) => void
  onRemove: (row: Row) => void
  onRunNow: (row: Row) => void
}

export type TimetableDayProps = TimetableRowActions & {
  /** Заголовок дня: Today, Tomorrow, день недели с датой или Missed. */
  title: string
  /** Дата рядом с Today и Tomorrow. */
  note?: string | undefined
  rows: readonly Row[]
  now: number
}

export type TimetableRowProps = TimetableRowActions & { row: Row; now: number }

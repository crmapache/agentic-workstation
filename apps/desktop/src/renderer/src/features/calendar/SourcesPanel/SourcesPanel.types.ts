import type { CalendarState, CalendarSourceView } from '@shared/calendar'

export type SourcesPanelProps = {
  state: CalendarState
}

export type SourceRowProps = {
  source: CalendarSourceView
  now: number
}

/** Строка состояния источника: ключ текста, его значения и тон. */
export type SourceStatus = {
  key: string
  values?: Record<string, string | number> | undefined
  tone: 'muted' | 'busy' | 'danger' | 'warning'
}

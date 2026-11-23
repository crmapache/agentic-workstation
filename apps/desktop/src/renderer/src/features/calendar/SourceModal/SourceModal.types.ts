import type { CalendarColor, CalendarSourceKind } from '@shared/calendar'
import type { EffortLevel } from '@shared/conversation'
import type { ProviderId } from '@shared/providers'

export type SourceModalProps = {
  /** null - новый источник. */
  sourceId: string | null
}

/**
 * Поля формы источника разом для всех видов: смена вида не теряет набранное, а в черновик уходят
 * только поля выбранного вида.
 */
export type SourceForm = {
  kind: CalendarSourceKind
  name: string
  color: CalendarColor
  visible: boolean
  inOverlaps: boolean
  /** Коннектор вида: Calendar у Google, Browser или Computer у чтения ИИ. */
  connectorId: string
  calendarIds: string[]
  /** Ссылка ICS или страница календаря для ИИ. */
  url: string
  profile: string
  app: string
  hints: string
  allowClicks: boolean
  weeksAhead: number
  provider: ProviderId
  model: string
  effort: EffortLevel | ''
}

export type SourceFieldsProps = {
  form: SourceForm
  onChange: (patch: Partial<SourceForm>) => void
}

export type KindFieldsProps = SourceFieldsProps & {
  /** Правка заведённого: ссылку ICS можно оставить прежней. */
  editing: boolean
}

/** Что не так с формой: ключ текста под ней. */
export type SourceFormProblem = 'name' | 'connector' | 'url' | 'profile' | 'app' | 'provider'

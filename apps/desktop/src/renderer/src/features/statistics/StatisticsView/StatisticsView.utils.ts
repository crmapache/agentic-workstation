import type {
  StatsPeak,
  StatsReport,
  StatsModelRow,
  StatsProjectRow,
  StatsCalendarDay,
  StatsLanguageRow,
} from '@shared/statistics'

import { dateLabel, hourRangeLabel, weekdayRangeLabel } from '../statistics-dates.utils'
import { formatCount } from '../statistics-format.utils'
import { modelLabel, projectLabel } from '../statistics-series.utils'
import { tokensOf } from '../statistics-totals.utils'
import { YOU_TONE, AGENTS_TONE } from '../statistics.constants'
import type { RankedRow, CalendarMetric } from '../statistics.types'
import { PRESENCE_DAYS_FOR_CALENDAR } from './StatisticsView.constants'

/** Шкала списка-рейтинга: самая большая строка - вся полоса. */
export const rankedTotal = (rows: readonly RankedRow[]): number =>
  Math.max(0, ...rows.map((row) => row.parts.reduce((sum, part) => sum + part.value, 0)))

/**
 * С какого дня считаются числа человека, если не с начала периода: since - дата, notYet -
 * их ещё нет вовсе; null - данные о человеке покрывают период целиком.
 */
export const humanNoteOf = (
  report: StatsReport,
): { kind: 'notYet' } | { kind: 'since'; date: string } | null => {
  if (report.humanDataStart === null) return { kind: 'notYet' }
  if (report.humanDataStart > report.period.from) {
    return { kind: 'since', date: dateLabel(report.humanDataStart) }
  }

  return null
}

/** Языки строками рейтинга: полоса - строки руками и агентами, расширение - с точкой. */
export const languageRows = (
  languages: readonly StatsLanguageRow[],
  noExtension: string,
): RankedRow[] =>
  languages.map((language) => {
    const you = language.manualAdded + language.manualRemoved
    const agents = language.agentAdded + language.agentRemoved

    return {
      key: language.ext,
      label: language.ext ? `.${language.ext}` : noExtension,
      value: formatCount(you + agents),
      parts: [
        { key: 'you', value: you, tone: YOU_TONE },
        { key: 'agents', value: agents, tone: AGENTS_TONE },
      ],
    }
  })

/** Когда пик одной строкой: «Tue-Thu, 10:00-13:00»; пика нет - null. */
export const peakWhenOf = (peak: StatsPeak): string | null => {
  const parts = [
    peak.weekdays ? weekdayRangeLabel(peak.weekdays) : '',
    peak.hours ? hourRangeLabel(peak.hours) : '',
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : null
}

/** Активные дни календаря - как у серий: было присутствие или сообщение человека. */
export const activeDaysOf = (calendar: readonly StatsCalendarDay[]): number =>
  calendar.filter((day) => day.presenceMinutes > 0 || day.prompts > 0).length

/**
 * Что красит календарь, если человек не выбирал: присутствие, когда его набралось на пару недель,
 * иначе токены - год из одного закрашенного дня читался бы как «почти не работаешь».
 */
export const calendarMetricOf = (
  chosen: CalendarMetric | null,
  calendar: readonly StatsCalendarDay[],
): CalendarMetric =>
  chosen ??
  (calendar.filter((day) => day.presenceMinutes > 0).length >= PRESENCE_DAYS_FOR_CALENDAR
    ? 'presence'
    : 'tokens')

/** Число строки рейтинга токенов: «3.1M · $12.40». */
type RowValue = (tokens: number, cost: number) => string

/** Модели по цене: полоса - цена (по ней и порядок), полное имя модели - в подсказке. */
export const modelRows = (models: readonly StatsModelRow[], rowValue: RowValue): RankedRow[] =>
  models.map((model) => ({
    key: model.model,
    label: modelLabel(model.model),
    value: rowValue(tokensOf(model.tokens), model.cost),
    hint: model.model,
    parts: [{ key: 'cost', value: model.cost, tone: AGENTS_TONE }],
  }))

/**
 * Проекты по токенам: имя - последняя папка, полный путь - в подсказке, открытый сейчас -
 * ярче. Папки вне известных проектов - одной строкой «Other folders». Проект без токенов
 * (у него только время или строки агентов) в этом рейтинге - пустая строка, её нет.
 */
export const projectRows = (
  projects: readonly StatsProjectRow[],
  activePath: string | null,
  otherFolders: string,
  rowValue: RowValue,
): RankedRow[] =>
  projects
    .filter((project) => project.tokens > 0)
    .map((project) => ({
      key: project.project ?? '',
      label: project.project === null ? otherFolders : projectLabel(project.project),
      value: rowValue(project.tokens, project.cost),
      hint: project.project ?? undefined,
      current: project.project !== null && project.project === activePath,
      parts: [{ key: 'tokens', value: project.tokens, tone: AGENTS_TONE }],
    }))

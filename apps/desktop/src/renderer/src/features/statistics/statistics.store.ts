import { create } from 'zustand'

import type { StatsSource } from '@shared/statistics'

import type { ScopeKind, PeriodKind, CalendarMetric } from './statistics.types'

type StatisticsStore = {
  period: PeriodKind
  source: StatsSource
  scope: ScopeKind
  /** null - календарь выбирает сам: присутствие, если оно уже есть, иначе токены. */
  calendar: CalendarMetric | null
  setPeriod: (period: PeriodKind) => void
  setSource: (source: StatsSource) => void
  setScope: (scope: ScopeKind) => void
  setCalendar: (calendar: CalendarMetric) => void
}

/**
 * Фильтры вида статистики: период, чьи агенты, какие проекты, что красит календарь. Живут
 * дольше вида: ушёл в редактор и вернулся - тот же срез. Числа - в кэше React Query
 * (state/statistics.queries.ts), не здесь. Сегодня - по умолчанию: чаще всего ищут цифры
 * дня, который идёт.
 */
export const useStatisticsStore = create<StatisticsStore>((set) => ({
  period: 'today',
  source: 'all',
  scope: 'all',
  calendar: null,
  setPeriod: (period) => set({ period }),
  setSource: (source) => set({ source }),
  setScope: (scope) => set({ scope }),
  setCalendar: (calendar) => set({ calendar }),
}))

import { create } from 'zustand'

import type { StatsSource } from '@shared/statistics'

import type { ScopeKind, PeriodKind, CalendarMetric } from './statistics.types'

type StatisticsStore = {
  period: PeriodKind
  /**
   * Последний день периода - местная полночь дня, выбранного в календаре или стрелками; null -
   * сегодня, и период сам переходит на новый день в полночь.
   */
  lastDay: number | null
  source: StatsSource
  scope: ScopeKind
  /** null - календарь выбирает сам: присутствие, если оно уже есть, иначе токены. */
  calendar: CalendarMetric | null
  setPeriod: (period: PeriodKind) => void
  setLastDay: (lastDay: number | null) => void
  setSource: (source: StatsSource) => void
  setScope: (scope: ScopeKind) => void
  setCalendar: (calendar: CalendarMetric) => void
}

/**
 * Фильтры вида статистики: период и его последний день, чьи агенты, какие проекты, что
 * красит календарь. Живут дольше вида: ушёл в редактор и вернулся - тот же срез. Числа - в
 * кэше React Query (state/statistics.queries.ts), не здесь. Сегодняшние сутки - по
 * умолчанию: чаще всего ищут цифры дня, который идёт. Смена периода день не сбрасывает:
 * с 12 ноября на «7 days» - неделя по 12-е.
 */
export const useStatisticsStore = create<StatisticsStore>((set) => ({
  period: 'day',
  lastDay: null,
  source: 'all',
  scope: 'all',
  calendar: null,
  setPeriod: (period) => set({ period }),
  setLastDay: (lastDay) => set({ lastDay }),
  setSource: (source) => set({ source }),
  setScope: (scope) => set({ scope }),
  setCalendar: (calendar) => set({ calendar }),
}))

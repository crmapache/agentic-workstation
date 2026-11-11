import type { StatsPeriod, StatsSource } from '@shared/statistics'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/**
 * Статистика IDE (docs/workplan/20-statistics.md). Владелец - главный процесс: база в
 * userData и чтение транскриптов. Здесь - отчёты по периодам в кэше: окно спрашивает период
 * с фильтрами, а главный процесс говорит, когда числа поменялись.
 */

/**
 * Отчёт за период [from, to) по источнику и проекту (null - все проекты). Пока считается
 * новый (сменили период или фильтр), на месте остаётся прежний: графики не мигают пустотой.
 * enabled - отчёт нужен не всегда (сравнение с прошлым есть не у каждого периода).
 */
export const useStatsReport = (
  period: StatsPeriod,
  source: StatsSource,
  projectId: string | null,
  enabled = true,
) =>
  useQuery({
    queryKey: QUERY_KEYS.statsReport(period.from, period.to, source, projectId),
    queryFn: () => invoke('stats:report', { period, source, projectId }),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    enabled,
  })

/**
 * Числа поменялись (дочитаны транскрипты, пришли живые события): отчёты, которые смотрят,
 * считаются заново, остальные - при следующем показе. Чаще раза в 30 секунд событие не
 * приходит - его придерживает главный процесс.
 */
export const useStatisticsSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('stats:changed', () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.statsReports })
  })
}

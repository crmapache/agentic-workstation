import { PROVIDER_IDS } from '@shared/providers'
import type { StatsSource, StatsProviderFilter } from '@shared/statistics'
import { MINUTE_MS } from '@shared/time-units'

import type { ChartTone } from '@agentic-workstation/ui/ChartTip.types'

import type { ScopeKind, PeriodKind } from './statistics.types'

export const PERIODS: readonly PeriodKind[] = ['day', 'week', 'month', 'all']

/**
 * Сколько дней в периоде по последний день включительно; на столько же шагают стрелки
 * соседнего периода. Всё время - не здесь: листать его некуда.
 */
export const PERIOD_DAYS: Record<Exclude<PeriodKind, 'all'>, number> = {
  day: 1,
  week: 7,
  month: 30,
}

export const SOURCES: readonly StatsSource[] = ['all', 'ide', 'outside']

/** Провайдеры фильтра - все, чьи журналы читает статистика, а не только те, что в IDE сейчас. */
export const PROVIDERS: readonly StatsProviderFilter[] = ['all', ...PROVIDER_IDS]

export const SCOPES: readonly ScopeKind[] = ['all', 'project']

/**
 * Тоны рядов - одни на весь вид: человек - первый (стальной), агенты - второй (оранжевый),
 * части входа модели и ответы на разрешения - третий и четвёртый. Ряд не перекрашивается
 * от фильтра.
 */
export const YOU_TONE: ChartTone = 'chart1'
export const AGENTS_TONE: ChartTone = 'chart2'
export const CACHE_READ_TONE: ChartTone = 'chart3'
export const CACHE_WRITE_TONE: ChartTone = 'chart4'
export const ALLOWED_TONE: ChartTone = 'chart3'
export const DENIED_TONE: ChartTone = 'chart4'

/**
 * Дней на графике больше этого - столбцы неделями: при ста днях столбец тоньше зазора
 * между ними, и график становится штриховкой.
 */
export const MAX_DAY_BARS = 92

/** Подписей под осью не больше этого: остальные шаги - в подсказке. */
export const AXIS_LABELS = 6

/** На графике недели по часам дата суток стоит под этим часом - по середине суток. */
export const DAY_LABEL_HOUR = 12

/**
 * Шаг «сейчас» для честного сравнения: прошлый период берётся до того же места, что
 * текущий, с точностью до этого шага. Мельче - запрос каждую минуту ради одной минуты.
 */
export const COMPARE_STEP_MS = 5 * MINUTE_MS

/** Подпись месяца над первой неделей календаря - только если до следующего месяца есть место. */
export const FIRST_MONTH_LABEL_MAX_DAY = 14

/** Подписи строк календаря: через одну, как у GitHub, иначе теснятся. */
export const LABELED_WEEKDAYS: readonly number[] = [0, 2, 4]

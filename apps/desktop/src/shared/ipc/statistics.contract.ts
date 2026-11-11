import type { StatsPeriod, StatsReport, StatsSource, StatsScanProgress } from '../statistics'

/** Минута присутствия человека в окне - по id проекта: путь знает главный процесс. */
export type PresenceEntry = { minute: number; projectId: string | null }

/** Правки руками за минуту: проект, расширение файла без точки, знаки и строки. */
export type ManualEntry = {
  minute: number
  projectId: string
  ext: string
  typed: number
  pasted: number
  added: number
  removed: number
}

/**
 * Часть контракта (contract.ts) про статистику (docs/workplan/20-statistics.md): отчёт за период
 * с фильтрами и живые пачки окна - присутствие человека и код руками. Правила -
 * .claude/rules/ipc-contract.md.
 */
export type StatisticsInvokeContract = {
  'stats:report': {
    request: { period: StatsPeriod; source: StatsSource; projectId: string | null }
    response: StatsReport
  }
  'stats:noteActivity': {
    request: { presence: PresenceEntry[]; manual: ManualEntry[] }
    response: void
  }
}

export type StatisticsEventContract = {
  /** Данные поменялись (дочитаны транскрипты, пришли живые события) - и как идёт первое чтение. */
  'stats:changed': StatsScanProgress
}

export const STATISTICS_CHANNELS = {
  'stats:report': true,
  'stats:noteActivity': true,
} satisfies Record<keyof StatisticsInvokeContract, true>

export const STATISTICS_EVENTS = {
  'stats:changed': true,
} satisfies Record<keyof StatisticsEventContract, true>

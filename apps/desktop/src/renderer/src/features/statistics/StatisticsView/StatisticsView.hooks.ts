import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import type { StatsReport } from '@shared/statistics'

import {
  periodOf,
  compareMomentOf,
  isHumanComparable,
  comparablePeriodOf,
} from '../statistics-period.utils'
import { COMPARE_STEP_MS } from '../statistics.constants'
import { useStatisticsStore } from '../statistics.store'
import type { StatisticsData } from '../statistics.types'
import { useStatsReport } from '../../../state/statistics.queries'
import { useActiveProject } from '../../../state/workspace.queries'
import { humanNoteOf } from './StatisticsView.utils'

/**
 * Строка под заголовком разделов с числами человека: с какого дня они считаются, если
 * период начинается раньше. Нет строки - данные о человеке покрывают период целиком.
 */
export const useHumanNote = (report: StatsReport): string | undefined => {
  const { t } = useTranslation()
  const note = humanNoteOf(report)

  if (!note) return undefined

  return note.kind === 'since'
    ? t('statistics.humanSince', { date: note.date })
    : t('statistics.humanNotYet')
}

/**
 * «Сейчас» с шагом сравнения: меняется раз в несколько минут, а не каждую секунду. Ключи
 * отчётов стоят, пока шаг не прошёл, а новая полночь сама переводит «сегодня» на новый день.
 */
const useCompareMoment = (): number => {
  const [moment, setMoment] = useState(() => compareMomentOf(Date.now()))

  useEffect(() => {
    const timer = window.setTimeout(
      () => setMoment(compareMomentOf(Date.now())),
      moment + COMPARE_STEP_MS - Date.now(),
    )

    return () => window.clearTimeout(timer)
  }, [moment])

  return moment
}

/**
 * Числа вида по фильтрам: отчёт периода и честное сравнение - тот же отрезок прошлого
 * периода до того же места (отдельный отчёт: главный процесс сравнивает с прошлым периодом
 * целиком). Сравнение спрашивается, только если главный процесс считает его честным по
 * началу данных.
 */
export const useStatisticsData = () => {
  const period = useStatisticsStore((state) => state.period)
  const source = useStatisticsStore((state) => state.source)
  const scope = useStatisticsStore((state) => state.scope)
  const project = useActiveProject()
  const moment = useCompareMoment()

  const range = periodOf(period, moment)
  const comparable = comparablePeriodOf(range, moment)
  const projectId = scope === 'project' ? (project?.id ?? null) : null
  const current = useStatsReport(range, source, projectId)
  const report = current.data
  const wantsPrevious =
    !current.isPlaceholderData && report !== undefined && report.previous !== null
  const previous = useStatsReport(comparable, source, projectId, wantsPrevious)

  if (!report) return { data: null, failed: current.isError }

  // Пока новое сравнение считается, на месте прежнее - если оно про тот же период и фильтр
  // (сдвинулось только «сейчас»), а не про другой срез.
  const previousReport = previous.data
  const matches =
    previousReport !== undefined &&
    previousReport.period.from === comparable.from &&
    previousReport.filter.source === report.filter.source &&
    previousReport.filter.project === report.filter.project

  const data: StatisticsData = {
    report,
    previous: report.previous !== null && matches ? previousReport.totals : null,
    humanComparable: isHumanComparable(report),
    refreshing: current.isPlaceholderData,
    period,
  }

  return { data, failed: false }
}

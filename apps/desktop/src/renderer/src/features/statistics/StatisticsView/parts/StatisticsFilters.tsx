import { useTranslation } from 'react-i18next'

import { Tabs } from '@agentic-workstation/ui/Tabs'

import styles from '../StatisticsView.module.scss'
import type { StatisticsFiltersProps } from '../StatisticsView.types'
import { SCOPES, PERIODS, SOURCES, PROVIDERS } from '../../statistics.constants'
import { useStatisticsStore } from '../../statistics.store'
import { useActiveProject } from '../../../../state/workspace.queries'
import { PeriodNavigator } from './PeriodNavigator'

/**
 * Фильтры - нижний ряд шапки вида (PageHeader toolbar): период и листание по датам слева,
 * чьи агенты, какой провайдер и какие проекты - справа. Каждый действует на весь вид сразу,
 * у графиков своих фильтров нет. Без открытого проекта выбирать «этот проект» не из чего -
 * переключателя нет.
 */
export const StatisticsFilters = ({ range, dataStart }: StatisticsFiltersProps) => {
  const { t } = useTranslation()
  const period = useStatisticsStore((state) => state.period)
  const source = useStatisticsStore((state) => state.source)
  const provider = useStatisticsStore((state) => state.provider)
  const scope = useStatisticsStore((state) => state.scope)
  const setPeriod = useStatisticsStore((state) => state.setPeriod)
  const setSource = useStatisticsStore((state) => state.setSource)
  const setProvider = useStatisticsStore((state) => state.setProvider)
  const setScope = useStatisticsStore((state) => state.setScope)
  const project = useActiveProject()

  return (
    <>
      <div className={styles.filterGroup}>
        <Tabs
          label={t('statistics.filters.period')}
          items={PERIODS.map((id) => ({ id, label: t(`statistics.periods.${id}`) }))}
          value={period}
          onChange={setPeriod}
        />
        <PeriodNavigator range={range} dataStart={dataStart} />
      </div>
      <div className={styles.filterGroup}>
        <Tabs
          label={t('statistics.filters.source')}
          items={SOURCES.map((id) => ({ id, label: t(`statistics.sources.${id}`) }))}
          value={source}
          onChange={setSource}
        />
        <Tabs
          label={t('statistics.filters.provider')}
          items={PROVIDERS.map((id) => ({ id, label: t(`statistics.providers.${id}`) }))}
          value={provider}
          onChange={setProvider}
        />
        {project && (
          <Tabs
            label={t('statistics.filters.scope')}
            items={SCOPES.map((id) => ({
              id,
              label: t(`statistics.scopes.${id}`),
              hint: id === 'project' ? project.name : undefined,
            }))}
            value={scope}
            onChange={setScope}
          />
        )}
      </div>
    </>
  )
}

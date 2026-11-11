import { useTranslation } from 'react-i18next'

import { Tabs } from '@agentic-workstation/ui/Tabs'

import styles from '../StatisticsView.module.scss'
import { SCOPES, PERIODS, SOURCES } from '../../statistics.constants'
import { useStatisticsStore } from '../../statistics.store'
import { useActiveProject } from '../../../../state/workspace.queries'

/**
 * Фильтры - нижний ряд шапки вида (PageHeader toolbar): период слева, чьи агенты и какие
 * проекты - справа. Каждый действует на весь вид сразу, у графиков своих фильтров нет. Без
 * открытого проекта выбирать «этот проект» не из чего - переключателя нет.
 */
export const StatisticsFilters = () => {
  const { t } = useTranslation()
  const period = useStatisticsStore((state) => state.period)
  const source = useStatisticsStore((state) => state.source)
  const scope = useStatisticsStore((state) => state.scope)
  const setPeriod = useStatisticsStore((state) => state.setPeriod)
  const setSource = useStatisticsStore((state) => state.setSource)
  const setScope = useStatisticsStore((state) => state.setScope)
  const project = useActiveProject()

  return (
    <>
      <Tabs
        label={t('statistics.filters.period')}
        items={PERIODS.map((id) => ({ id, label: t(`statistics.periods.${id}`) }))}
        value={period}
        onChange={setPeriod}
      />
      <div className={styles.filterGroup}>
        <Tabs
          label={t('statistics.filters.source')}
          items={SOURCES.map((id) => ({ id, label: t(`statistics.sources.${id}`) }))}
          value={source}
          onChange={setSource}
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

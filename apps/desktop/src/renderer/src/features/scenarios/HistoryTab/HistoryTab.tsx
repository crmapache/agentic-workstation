import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'

import { useNow } from '../scenarios-clock.hooks'
import { pastRuns } from '../scenarios-runs.utils'
import { ScenarioConfirm } from '../ScenarioConfirm/ScenarioConfirm'
import type { ScenariosTabProps } from '../ScenariosView/ScenariosView.types'
import { useScenarioQueues, useScenarioShelves } from '../../../state/scenarios.queries'
import { MOMENT_TICK_MS } from './HistoryTab.constants'
import { useHistoryActions } from './HistoryTab.hooks'
import { PastRunsTable } from './parts/PastRunsTable'

/**
 * Вкладка History (RunsBand в ACC): законченные прогоны проекта таблицей, свежие сверху. Их
 * сравнивают с десятком других - когда, сколько шёл, во что обошёлся - вниз по колонке, а не
 * поперёк строки. Идущие здесь не стоят: они на вкладке очередей, с кнопками.
 */
export const HistoryTab = ({ project }: ScenariosTabProps) => {
  const { t } = useTranslation()
  const view = useScenarioShelves(project.id).data
  const live = useScenarioQueues().data?.live
  const history = useHistoryActions(project)
  const past = pastRuns(view?.runs ?? [], live ?? [])
  const now = useNow(past.length > 0, MOMENT_TICK_MS)

  if (!view) return <EmptyState icon={History} title={t('scenarios.history.loading')} />

  return (
    <>
      <Section
        title={t('scenarios.history.title')}
        count={past.length}
        help={
          <HelpButton
            label={t('scenarios.history.help.label')}
            title={t('scenarios.history.title')}
            text={t('scenarios.history.help.text')}
            closeLabel={t('common.close')}
          />
        }>
        {past.length === 0 ? (
          <EmptyState icon={History} title={t('scenarios.history.emptyTitle')} />
        ) : (
          <PastRunsTable
            runs={past}
            shown={history.shown}
            now={now}
            onOpen={history.open}
            onStar={history.star}
            onDelete={history.remove}
            onMore={history.more}
            onFewer={history.fewer}
          />
        )}
      </Section>
      <ScenarioConfirm
        open={history.doomed !== null}
        title={t('scenarios.history.confirmDelete.title')}
        subject={history.doomed?.scenarioName ?? ''}
        note={t('scenarios.history.confirmDelete.note')}
        submit={t('scenarios.history.confirmDelete.submit')}
        onSubmit={history.confirmDelete}
        onClose={history.cancelDelete}
      />
    </>
  )
}

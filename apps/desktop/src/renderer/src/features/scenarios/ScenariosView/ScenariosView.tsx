import { Play, Plus, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { useScenariosStore } from '../scenarios.store'
import { useScenarioQueues, useScenarioShelves } from '../../../state/scenarios.queries'
import { useActiveProject } from '../../../state/workspace.queries'
import styles from './ScenariosView.module.scss'
import { tabItems } from './ScenariosView.utils'
import { ScenariosModals } from './parts/ScenariosModals'
import { ScenariosTabBody } from './parts/ScenariosTabBody'

/**
 * Сценарии на уровне IDE (ADR 0039) - вид середины окна: шапка с запуском и новым сценарием,
 * под её линией вкладки (очереди проекта, все очереди, полки, расписание, история), окна поверх.
 */
export const ScenariosView = () => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const tab = useScenariosStore((state) => state.tab)
  const setTab = useScenariosStore((state) => state.setTab)
  const open = useScenariosStore((state) => state.open)
  const { data: queues } = useScenarioQueues()
  const { data: shelves } = useScenarioShelves(project?.id ?? null)

  if (!project) {
    return (
      <EmptyState
        icon={Workflow}
        title={t('scenarios.title')}
        description={t('scenarios.noProject')}
      />
    )
  }

  const items = tabItems((id) => t(`scenarios.tabs.${id}`), project.rootPath, queues, shelves)
  const handleRun = () => open({ kind: 'launch' })
  const handleNew = () => open({ kind: 'author' })

  return (
    <div className={styles.view}>
      <PageHeader
        icon={Workflow}
        title={t('scenarios.title')}
        help={
          <HelpButton
            label={t('scenarios.help.label')}
            title={t('scenarios.help.title')}
            text={t('scenarios.help.text')}
            closeLabel={t('common.close')}
          />
        }
        actions={
          <>
            <Button variant="ghost" icon={Plus} onClick={handleNew}>
              {t('scenarios.actions.new')}
            </Button>
            <Button icon={Play} onClick={handleRun}>
              {t('scenarios.actions.run')}
            </Button>
          </>
        }
        toolbar={
          <Tabs label={t('scenarios.tabs.label')} items={items} value={tab} onChange={setTab} />
        }
      />
      <div className={styles.scroller}>
        <div className={styles.page}>
          <ScenariosTabBody tab={tab} project={project} />
        </div>
      </div>
      <ScenariosModals project={project} />
    </div>
  )
}

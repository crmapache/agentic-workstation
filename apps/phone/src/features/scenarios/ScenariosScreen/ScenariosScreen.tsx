import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import type { RouteOf } from '../../../lib/route.types'
import { useRouter } from '../../../lib/router.store'
import { failureText } from '../../../state/commands.utils'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { Screen } from '../../../shell/Screen/Screen'
import { useScenariosScreen } from './ScenariosScreen.hooks'
import styles from './ScenariosScreen.module.scss'
import { RunHistory } from './parts/RunHistory'
import { ScheduleSection } from './parts/ScheduleSection'
import { ShelfSections } from './parts/ShelfSections'

/**
 * Сценарии проекта: полки (проектная и личная), отложенные запуски и прошлые прогоны. Написать
 * новый сценарий моделью и запустить - в низу, под пальцем.
 */
export const ScenariosScreen = ({ route }: { route: RouteOf<'scenarios'> }) => {
  const { t } = useTranslation()
  const { agentId, projectKey } = route
  const navigate = useRouter((state) => state.navigate)
  const screen = useScenariosScreen(route)
  const { shelves } = screen

  return (
    <Screen
      title={t('scenarios.title')}
      subtitle={screen.project?.name}
      agentId={agentId}
      help={{ title: t('scenarios.help.title'), text: t('scenarios.help.text') }}
      footer={
        <div className={styles.footer}>
          <Button size="touch" onClick={() => navigate({ name: 'draft', agentId, projectKey })}>
            {t('scenarios.write')}
          </Button>
          <Button
            size="touch"
            variant="primary"
            onClick={() => navigate({ name: 'startScenario', agentId, projectKey })}>
            {t('project.startScenario')}
          </Button>
        </div>
      }>
      {shelves.isPending && <LinkWait agentId={agentId} label={t('start.loading')} />}
      {shelves.isError && (
        <div className={styles.failed}>
          <p className={styles.error}>{failureText(t, shelves.error)}</p>
          <Button size="touch" onClick={() => void shelves.refetch()}>
            {t('history.retry')}
          </Button>
        </div>
      )}
      {shelves.data && (
        <>
          <ShelfSections route={route} scenarios={shelves.data.scenarios} />
          {shelves.data.schedules && <ScheduleSection shelves={shelves.data} screen={screen} />}
          {shelves.data.runs && (
            <RunHistory
              route={route}
              runs={shelves.data.runs}
              more={shelves.data.moreRuns ?? false}
              screen={screen}
            />
          )}
        </>
      )}
    </Screen>
  )
}

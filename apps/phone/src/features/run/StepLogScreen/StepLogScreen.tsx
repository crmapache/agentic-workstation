import { RefreshCw, ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import type { RouteOf } from '../../../lib/route.types'
import { failureText } from '../../../state/commands.utils'
import { Feed } from '../../conversation/Feed/Feed'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { Screen } from '../../../shell/Screen/Screen'
import { useStepLogScreen } from './StepLogScreen.hooks'
import styles from './StepLogScreen.module.scss'

/**
 * Журнал шага прогона или его головы - разговор карточки той же лентой, что разговор, только
 * для чтения: без действий и без крупных фото. Живьём он не обновляется - «обновить» в шапке.
 */
export const StepLogScreen = ({ route }: { route: RouteOf<'stepLog'> }) => {
  const { t } = useTranslation()
  const screen = useStepLogScreen(route)
  const { log, view } = screen

  return (
    <Screen
      title={screen.title}
      subtitle={screen.scenarioName}
      agentId={route.agentId}
      help={{ title: t('stepLog.help.title'), text: t('stepLog.help.text') }}
      actions={
        <IconButton
          icon={RefreshCw}
          size="touch"
          label={t('stepLog.refresh')}
          disabled={log.isFetching}
          onClick={screen.handleRefresh}
        />
      }
      bodyRef={screen.bodyRef}>
      {log.isPending && <LinkWait agentId={route.agentId} label={t('stepLog.loading')} />}
      {log.isError && (
        <div className={styles.failed}>
          <p className={styles.error}>{failureText(t, log.error)}</p>
          <Button size="touch" onClick={() => void log.refetch()}>
            {t('history.retry')}
          </Button>
        </div>
      )}
      {view && !screen.found && <EmptyState icon={ScrollText} title={t('stepLog.none')} />}
      {view && screen.found && (
        <Feed
          agentId={route.agentId}
          view={view}
          working={null}
          loadingEarlier={log.isFetchingPreviousPage}
          photos={false}
          onLoadEarlier={screen.handleLoadEarlier}
        />
      )}
    </Screen>
  )
}

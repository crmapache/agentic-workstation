import { SearchX, ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { RouteOf } from '../../../lib/route.types'
import { useRouter } from '../../../lib/router.store'
import { isRunOver, RUN_TONES } from '../../../lib/status.constants'
import { costText } from '../../../lib/time.utils'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { ListGroup } from '../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../shell/ListRow/ListRow'
import { Screen } from '../../../shell/Screen/Screen'
import { StatusLine } from '../../../shell/StatusLine/StatusLine'
import { HEAD_LOG } from './RunScreen.constants'
import { useRunScreen } from './RunScreen.hooks'
import styles from './RunScreen.module.scss'
import { CarryOnCard } from './parts/CarryOnCard'
import { RunFooter } from './parts/RunFooter'
import { RunNotes } from './parts/RunNotes'
import { RunSteps } from './parts/RunSteps'

/**
 * Прогон сценария: дорожка этапов и шагов, продолжить после лимита или остановки, журналы шагов
 * и головы. Всё, что нажимают, пока прогон идёт, - в низу под пальцем: вопрос головы над полем
 * (как вопрос хода в разговоре), пауза и стоп, «написать голове».
 */
export const RunScreen = ({ route }: { route: RouteOf<'run'> }) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const screen = useRunScreen(route)
  const { run } = screen
  const help = { title: t('run.help.title'), text: t('run.help.text') }

  const handleOpenLog = (stepKey: string) =>
    navigate({
      name: 'stepLog',
      agentId: route.agentId,
      projectKey: route.projectKey,
      runId: route.runId,
      stepKey,
    })

  if (!run) {
    return (
      <Screen title={t('run.title')} agentId={route.agentId} help={help}>
        {run === null ? (
          <EmptyState icon={SearchX} title={t('run.gone')} />
        ) : (
          <LinkWait agentId={route.agentId} label={t('run.loading')} />
        )}
      </Screen>
    )
  }

  // Прогон ACC (плагин в JetBrains) - только посмотреть: им управляет ACC.
  const isAcc = run.origin === 'acc'

  return (
    <Screen
      title={run.scenarioName}
      subtitle={
        <StatusLine
          badge={
            <Badge tone={RUN_TONES[run.state] ?? 'neutral'}>{t(`runState.${run.state}`)}</Badge>
          }
          text={costText(run.cost)}
        />
      }
      agentId={route.agentId}
      help={help}
      footer={
        !isRunOver(run.state) &&
        !isAcc && (
          <RunFooter draftKey={`run|${route.agentId}|${run.id}`} run={run} screen={screen} />
        )
      }>
      {!isAcc && <CarryOnCard run={run} busy={screen.busy} onCarryOn={screen.carryOn} />}
      <RunSteps run={run} onOpenLog={handleOpenLog} />
      <ListGroup label={t('run.headLog')}>
        <ListRow
          title={t('run.headLog')}
          leading={<ScrollText className={styles.rowIcon} aria-hidden />}
          onClick={() => handleOpenLog(HEAD_LOG)}
        />
      </ListGroup>
      <RunNotes notes={run.notes} />
    </Screen>
  )
}

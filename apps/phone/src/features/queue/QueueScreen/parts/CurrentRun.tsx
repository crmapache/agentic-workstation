import { useState } from 'react'
import { Play, Pause, Square, Workflow, ArrowRight, CircleStop } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { QueueWire, RunSummaryWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'

import type { useQueueScreen } from '../QueueScreen.hooks'
import styles from '../QueueScreen.module.scss'
import type { RouteOf } from '../../../../lib/route.types'
import { useRouter } from '../../../../lib/router.store'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'

/** Идущий прогон очереди: этап, доля шагов, вопрос к человеку и кнопки прогона. */
export const CurrentRun = ({
  route,
  queue,
  run,
  screen,
}: {
  route: RouteOf<'queue'>
  queue: QueueWire
  run: RunSummaryWire
  screen: ReturnType<typeof useQueueScreen>
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const [isStopping, setIsStopping] = useState(false)
  const paused = run.state === 'paused'
  const stopsAfter = queue.stopAfterItemId === run.itemId
  const facts = [run.stageTitle, t('queue.stepsDone', { done: run.done, total: run.total })]

  const handleOpen = () =>
    navigate({ name: 'run', agentId: route.agentId, projectKey: route.projectKey, runId: run.id })

  const handleStopAfter = () =>
    screen.queueAction({ kind: 'stopAfter', itemId: stopsAfter ? null : run.itemId })

  return (
    <Card
      tone={run.asking ? 'accent' : 'neutral'}
      icon={Workflow}
      title={run.scenarioName}
      description={facts.filter(Boolean).join(' · ')}>
      <div className={styles.runFacts}>
        <ProgressBar
          label={t('queue.progress')}
          value={run.total > 0 ? run.done / run.total : 0}
          tone={paused ? 'warning' : 'accent'}
        />
        {run.asking && <p className={styles.asking}>{run.asking}</p>}
        <div className={styles.runActions}>
          <Button
            size="touch"
            icon={paused ? Play : Pause}
            disabled={screen.busy}
            onClick={() => screen.runAction(run.id, paused ? 'resume' : 'pause')}>
            {t(paused ? 'run.resume' : 'run.pause')}
          </Button>
          <Button size="touch" variant="danger" icon={Square} onClick={() => setIsStopping(true)}>
            {t('run.stop')}
          </Button>
          <Button size="touch" icon={CircleStop} disabled={screen.busy} onClick={handleStopAfter}>
            {t(stopsAfter ? 'queue.keepGoing' : 'queue.stopAfterCurrent')}
          </Button>
          <Button size="touch" variant="primary" icon={ArrowRight} onClick={handleOpen}>
            {t('queue.openRun')}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={isStopping}
        title={t('run.stopConfirm', { name: run.scenarioName })}
        confirmLabel={t('run.stop')}
        onConfirm={() => screen.runAction(run.id, 'stop')}
        onClose={() => setIsStopping(false)}
      />
    </Card>
  )
}

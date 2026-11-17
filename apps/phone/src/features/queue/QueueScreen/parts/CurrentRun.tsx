import { useState } from 'react'
import { Play, Pause, Square, Workflow, ArrowRight, CircleStop } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { QueueWire, RunSummaryWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'

import type { useQueueScreen } from '../QueueScreen.hooks'
import styles from '../QueueScreen.module.scss'
import type { Confirmation } from '../QueueScreen.types'
import { useNow } from '../../../../lib/now.hooks'
import type { RouteOf } from '../../../../lib/route.types'
import { useRouter } from '../../../../lib/router.store'
import { runWorked } from '../../../../lib/scenarios.utils'
import { durationText } from '../../../../lib/time.utils'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'

/**
 * Идущий прогон очереди: этап, доля шагов, сколько работает, вопрос к человеку и кнопки прогона. Пауза и Stop -
 * парой, длинные «остановиться после» и «открыть прогон» - каждая своим рядом: в половине ширины
 * их подписи переносились, и кнопки выходили вдвое толще. Stop и «остановиться после» - через
 * «точно?».
 */
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
  const [confirming, setConfirming] = useState<Confirmation | null>(null)
  const paused = run.state === 'paused'
  const stopsAfter = queue.stopAfterItemId === run.itemId
  const name = run.scenarioName
  const now = useNow(1000)
  const facts = [
    run.stageTitle,
    t('queue.stepsDone', { done: run.done, total: run.total }),
    run.startedAt > 0 && durationText(t, runWorked(run, now + screen.offset)),
  ]

  const handleOpen = () =>
    navigate({ name: 'run', agentId: route.agentId, projectKey: route.projectKey, runId: run.id })

  const handleStop = () =>
    setConfirming({
      title: t('run.stopConfirm', { name }),
      label: t('run.stop'),
      tone: 'danger',
      onConfirm: () => screen.runAction(run, 'stop'),
    })

  const handleStopAfter = () =>
    setConfirming({
      title: t(stopsAfter ? 'queue.keepGoingConfirm' : 'queue.stopAfterConfirm', { name }),
      label: t(stopsAfter ? 'queue.keepGoing' : 'queue.stopAfterCurrent'),
      tone: 'primary',
      onConfirm: () =>
        screen.queueAction({ kind: 'stopAfter', itemId: stopsAfter ? null : run.itemId }),
    })

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
            onClick={() => screen.runAction(run, paused ? 'resume' : 'pause')}>
            {t(paused ? 'run.resume' : 'run.pause')}
          </Button>
          <Button size="touch" variant="danger" icon={Square} onClick={handleStop}>
            {t('run.stop')}
          </Button>
          <span className={styles.wideAction}>
            <Button size="touch" icon={CircleStop} disabled={screen.busy} onClick={handleStopAfter}>
              {t(stopsAfter ? 'queue.keepGoing' : 'queue.stopAfterCurrent')}
            </Button>
          </span>
          <span className={styles.wideAction}>
            <Button size="touch" variant="primary" icon={ArrowRight} onClick={handleOpen}>
              {t('queue.openRun')}
            </Button>
          </span>
        </div>
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.title ?? ''}
        text={confirming?.text}
        confirmLabel={confirming?.label ?? ''}
        tone={confirming?.tone}
        onConfirm={() => confirming?.onConfirm()}
        onClose={() => setConfirming(null)}
      />
    </Card>
  )
}

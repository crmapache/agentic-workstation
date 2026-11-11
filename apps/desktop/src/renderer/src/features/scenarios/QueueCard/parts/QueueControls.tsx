import { useState } from 'react'
import { Play, Plus, Pause, Square, OctagonPause } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../QueueCard.module.scss'
import type { QueueControlsProps } from '../QueueCard.types'
import { runningItemOf } from '../../scenarios-queues.utils'
import { useScenarioActions } from '../../scenarios.actions'
import { useScenariosStore } from '../../scenarios.store'
import { StopRunDialog } from './StopRunDialog'

/**
 * Кнопки полосы. Пока сценарий идёт: пауза сразу (процессы живы, продолжит с места), «Stop
 * after current» - дать ему кончить и дальше не брать, Stop - оборвать (с вопросом). Добавить
 * сценарий в эту очередь можно всегда: очередь набивают, пока она работает.
 */
export const QueueControls = ({ queue, live }: QueueControlsProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()
  const open = useScenariosStore((state) => state.open)
  const [isStopping, setIsStopping] = useState(false)
  const running = runningItemOf(queue)
  const isPaused = live?.state === 'paused'
  const isMarked = running !== null && queue.stopAfterItemId === running.id
  const place = { queueId: queue.id }

  const handlePause = () => {
    if (live) void actions.control(place, live.id, isPaused ? 'resume' : 'pause')
  }

  const handleStopAfter = () => {
    if (running)
      void actions.queue(queue.id, { kind: 'stopAfter', itemId: isMarked ? null : running.id })
  }

  const handleStop = () => setIsStopping(true)

  const handleStopClosed = () => setIsStopping(false)

  const handleAdd = () => open({ kind: 'launch', queueId: queue.id })

  return (
    <div className={styles.controls} role="group" aria-label={t('scenarios.queues.controls.label')}>
      {running && (
        <>
          <Button
            size="sm"
            variant={isPaused ? 'primary' : 'secondary'}
            icon={isPaused ? Play : Pause}
            disabled={!live}
            onClick={handlePause}>
            {isPaused
              ? t('scenarios.queues.controls.resume')
              : t('scenarios.queues.controls.pause')}
          </Button>
          <Button size="sm" icon={OctagonPause} onClick={handleStopAfter}>
            {isMarked
              ? t('scenarios.queues.controls.keepGoing')
              : t('scenarios.queues.controls.stopAfterCurrent')}
          </Button>
          <Button size="sm" icon={Square} disabled={!live} onClick={handleStop}>
            {t('scenarios.queues.controls.stop')}
          </Button>
        </>
      )}
      <span className={styles.controlsEnd}>
        <Button size="sm" variant="ghost" icon={Plus} onClick={handleAdd}>
          {t('scenarios.queues.controls.add')}
        </Button>
      </span>
      {isStopping && running && live && (
        <StopRunDialog queue={queue} item={running} runId={live.id} onClose={handleStopClosed} />
      )}
    </div>
  )
}

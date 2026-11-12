import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'

import { useOpenRun } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { QueueRunningProps } from '../QueueCard.types'
import { isAsking, roadMood } from '../../scenarios-queues.utils'
import { ScenarioRoadmap } from '../../ScenarioRoadmap/ScenarioRoadmap'
import { RunReadings } from './RunReadings'

/**
 * Идущий сценарий подробно: этап, дорога карточек, часы, токены, деньги - и вопрос, если прогон
 * встал на нём. Вопрос - оранжевым с «Answer»: единственное здесь, что ждёт человека.
 * Дороги ещё нет (прогон только поднимается) - полоса доли готовых карточек.
 */
export const QueueRunning = ({ queue, live }: QueueRunningProps) => {
  const { t } = useTranslation()
  const openRun = useOpenRun(queue.id)

  const handleAnswer = () => openRun(live.id)

  return (
    <div className={styles.running}>
      {/* Строка этапа есть с первого кадра: появившись позже, она сдвигала бы полосу. */}
      <div className={styles.stage}>{live.stageTitle || live.at || live.scenarioName}</div>
      {live.roadmap.length > 0 ? (
        <ScenarioRoadmap stops={live.roadmap} mood={roadMood(live.state)} />
      ) : (
        <div className={styles.progress}>
          <ProgressBar
            value={live.total > 0 ? live.done / live.total : 0}
            label={t('scenarios.queues.running.progress')}
          />
          <span className={styles.progressCount}>
            {t('scenarios.queues.running.cards', { done: live.done, total: live.total })}
          </span>
        </div>
      )}
      <RunReadings live={live} />
      {isAsking(live) && (
        <div className={styles.ask}>
          <span className={styles.askLabel}>{t('scenarios.queues.running.asking')}</span>
          <span className={styles.askText}>
            {live.asking || t('scenarios.queues.running.askingBlank')}
          </span>
          <Button size="sm" variant="primary" onClick={handleAnswer}>
            {t('scenarios.queues.running.answer')}
          </Button>
        </div>
      )}
    </div>
  )
}

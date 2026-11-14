import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { useOpenRun } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { QueueCompactProps } from '../QueueCard.types'
import { roadMood, runningItemOf } from '../../scenarios-queues.utils'
import { ScenarioRoadmap } from '../../ScenarioRoadmap/ScenarioRoadmap'
import { QueueBadges } from './QueueBadges'
import { QueueDots } from './QueueDots'

/**
 * Очередь другого проекта плотной карточкой: нажимается вся и ведёт к её проекту (клавиатуре -
 * кнопка имени), метки - где и что, элементы - точками (когда их больше одного: единственный и
 * так сказан меткой состояния), идущий - этапом и дорогой карточек. Вопрос человеку отвечается
 * прямо отсюда, не переключая проект.
 */
export const QueueCompact = ({ queue, live, status, onOpen }: QueueCompactProps) => {
  const { t } = useTranslation()
  const openRun = useOpenRun(queue.id)
  const isAsking = status.kind === 'asking'
  const hasDots = queue.items.length > 1
  const canAnswer = isAsking && live !== undefined
  const road = runningItemOf(queue) && live && live.roadmap.length > 0 ? live : null

  const handleAnswer = () => {
    if (live) openRun(live.id)
  }

  return (
    <Card size="sm" tone={isAsking ? 'accent' : 'neutral'} onPress={onOpen}>
      <div className={styles.compact}>
        <div className={styles.header}>
          <Tooltip label={t('scenarios.queues.others.openQueue')} stretch>
            <button
              type="button"
              className={styles.compactName}
              disabled={!onOpen}
              onClick={onOpen}>
              {queue.name}
            </button>
          </Tooltip>
          <div className={styles.meta}>
            <QueueBadges queue={queue} status={status} />
          </div>
        </div>
        {(hasDots || canAnswer) && (
          <div className={styles.compactItems}>
            {hasDots && <QueueDots queue={queue} live={live} />}
            {canAnswer && (
              <span className={styles.controlsEnd}>
                <Button size="sm" variant="primary" onClick={handleAnswer}>
                  {t('scenarios.queues.running.answer')}
                </Button>
              </span>
            )}
          </div>
        )}
        {road && (
          <div className={styles.running}>
            <div className={styles.stage}>{road.stageTitle || road.at || road.scenarioName}</div>
            <ScenarioRoadmap stops={road.roadmap} mood={roadMood(road.state)} />
          </div>
        )}
      </div>
    </Card>
  )
}

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
 * Очередь строкой доски: имя ведёт к её проекту, метки - где и что, элементы - точками, идущий -
 * дорогой карточек. Вопрос человеку отвечается прямо отсюда: доска - то место, где видно, кто
 * из всех проектов ждёт.
 */
export const QueueCompact = ({ queue, live, status, onOpen }: QueueCompactProps) => {
  const { t } = useTranslation()
  const openRun = useOpenRun(queue.id)
  const isAsking = status.kind === 'asking'

  const handleAnswer = () => {
    if (live) openRun(live.id)
  }

  return (
    <Card size="sm" tone={isAsking ? 'accent' : 'neutral'}>
      <div className={styles.compact}>
        <div className={styles.header}>
          <Tooltip label={t('scenarios.board.openQueue')} stretch>
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
        <div className={styles.compactItems}>
          <QueueDots queue={queue} live={live} />
          {isAsking && live && (
            <Button size="sm" variant="primary" onClick={handleAnswer}>
              {t('scenarios.queues.running.answer')}
            </Button>
          )}
        </div>
        {runningItemOf(queue) && live && live.roadmap.length > 0 && (
          <ScenarioRoadmap stops={live.roadmap} mood={roadMood(live.state)} />
        )}
      </div>
    </Card>
  )
}

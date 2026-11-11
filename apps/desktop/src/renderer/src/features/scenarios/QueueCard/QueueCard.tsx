import { useState } from 'react'

import { Card } from '@agentic-workstation/ui/Card'

import { queueStatus, runningItemOf } from '../scenarios-queues.utils'
import styles from './QueueCard.module.scss'
import type { QueueCardProps } from './QueueCard.types'
import { QueueCompact } from './parts/QueueCompact'
import { QueueControls } from './parts/QueueControls'
import { QueueHeader } from './parts/QueueHeader'
import { QueueHold } from './parts/QueueHold'
import { QueueItems } from './parts/QueueItems'
import { QueueRunning } from './parts/QueueRunning'

/**
 * Очередь сценариев полосой: имя, где работает, что делает; элементы по порядку, идущий -
 * с дорогой карточек и часами; почему встала и как её пустить; пауза, остановка после
 * текущего, добавить. compact - та же очередь строкой на доске всех очередей.
 * Ждущий человека прогон красит карточку акцентом: это единственное, что ждёт ответа.
 */
export const QueueCard = ({ queue, live, compact = false, onOpen }: QueueCardProps) => {
  const [isRenaming, setIsRenaming] = useState(false)
  const status = queueStatus(queue, live)
  const isGoing = runningItemOf(queue) !== null
  // Закрытая очередь на виду только ради своего worktree: запускать в неё больше нечего.
  const isClosed = queue.closedAt > 0

  if (compact) return <QueueCompact queue={queue} live={live} status={status} onOpen={onOpen} />

  return (
    <Card tone={status.kind === 'asking' ? 'accent' : 'neutral'}>
      <div className={styles.lane}>
        <QueueHeader
          queue={queue}
          status={status}
          isRenaming={isRenaming}
          onRenaming={setIsRenaming}
        />
        {queue.hold && <QueueHold queue={queue} hold={queue.hold} />}
        <QueueItems queue={queue} live={live} />
        {isGoing && live && <QueueRunning queue={queue} live={live} />}
        {!isClosed && <QueueControls queue={queue} live={live} />}
      </div>
    </Card>
  )
}

import { Badge } from '@agentic-workstation/ui/Badge'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { useStatusWord, useWorkdirWord } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { QueueBadgesProps } from '../QueueCard.types'
import { statusTone } from '../../scenarios-queues.utils'

/**
 * Где очередь работает и что делает - две метки. У живого worktree в подсказке путь: по нему
 * его находят в терминале; удалённый остаётся словом - очередь помнит, где работала.
 */
export const QueueBadges = ({ queue, status }: QueueBadgesProps) => {
  const statusWord = useStatusWord()
  const workdirWord = useWorkdirWord()
  const { workdir } = queue
  // Серым всегда: цвет метки значит состояние (ADR 0006), а папка - не состояние.
  const place = <Badge>{workdirWord(workdir)}</Badge>

  return (
    <span className={styles.badges}>
      {workdir.kind === 'worktree' && !workdir.removed ? (
        <Tooltip label={workdir.projectDir || workdir.path}>{place}</Tooltip>
      ) : (
        place
      )}
      <Badge tone={statusTone(status)}>{statusWord(status)}</Badge>
    </span>
  )
}

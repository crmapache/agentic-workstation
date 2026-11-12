import { useProviderLabel } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { QueueHeaderProps } from '../QueueCard.types'
import { QueueBadges } from './QueueBadges'
import { QueueMenu } from './QueueMenu'
import { QueueName } from './QueueName'

/**
 * Шапка полосы: имя (переименование на месте) и меню первой строкой, провайдер, папка и
 * состояние - второй. В узкой середине длинная метка worktree иначе сжимала имя до нуля.
 */
export const QueueHeader = ({ queue, status, isRenaming, onRenaming }: QueueHeaderProps) => {
  const provider = useProviderLabel(queue)

  const handleRename = () => onRenaming(true)

  return (
    <div className={styles.header}>
      <div className={styles.titleRow}>
        <QueueName queue={queue} isRenaming={isRenaming} onRenaming={onRenaming} />
        <QueueMenu queue={queue} onRename={handleRename} />
      </div>
      <div className={styles.meta}>
        {provider && <span className={styles.provider}>{provider}</span>}
        <QueueBadges queue={queue} status={status} />
      </div>
    </div>
  )
}

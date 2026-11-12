import { useTranslation } from 'react-i18next'

import styles from '../QueueCard.module.scss'
import type { QueueItemsProps } from '../QueueCard.types'
import { QueueItemChip } from './QueueItemChip'

/** Элементы очереди в том порядке, в каком идут: прошедшие, идущий, ждущие. */
export const QueueItems = ({ queue, live }: QueueItemsProps) => {
  const { t } = useTranslation()

  return (
    <ol className={styles.items} aria-label={t('scenarios.queues.items.label')}>
      {queue.items.map((item, index) => (
        <QueueItemChip key={item.id} queue={queue} item={item} number={index + 1} live={live} />
      ))}
    </ol>
  )
}

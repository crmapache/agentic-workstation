import { useTranslation } from 'react-i18next'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import styles from '../Feed.module.scss'
import { flag, list, count, isFields } from '../Feed.utils'
import { costText, durationText } from '../../../../lib/time.utils'

/**
 * Конец хода тихой подписью под ответом, у левого края, как подпись хода в панели IDE: итог,
 * время, цена и сколько файлов тронуто. Строки правок - цветом, как у вызова правки в ленте:
 * плюс зелёным, минус красным.
 */
export const TurnLine = ({ item }: { item: FeedItemWire }) => {
  const { t } = useTranslation()
  const changes = list(item, 'changes').filter(isFields)
  const added = changes.reduce((sum, change) => sum + count(change, 'added'), 0)
  const removed = changes.reduce((sum, change) => sum + count(change, 'removed'), 0)
  const cost = count(item, 'costUsd')
  const head = flag(item, 'interrupted')
    ? t('feed.turn.stopped')
    : flag(item, 'isError')
      ? t('feed.turn.error')
      : t('feed.turn.done')
  const words = [
    head,
    durationText(t, count(item, 'durationMs')),
    cost > 0 && costText(cost),
    changes.length > 0 && t('feed.turn.files', { count: changes.length }),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <p className={styles.turn}>
      <span>{words}</span>
      {changes.length > 0 && (
        <span className={styles.counts}>
          <span className={styles.added}>{t('feed.added', { count: added })}</span>
          <span className={styles.removed}>{t('feed.removed', { count: removed })}</span>
        </span>
      )}
    </p>
  )
}

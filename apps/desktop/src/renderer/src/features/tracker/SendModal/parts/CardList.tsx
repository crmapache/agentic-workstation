import { useTranslation } from 'react-i18next'

import styles from '../SendModal.module.scss'
import type { CardListProps } from '../SendModal.types'
import { CardRow } from './CardRow'

/**
 * Что уйдёт в очередь: карточки по порядку, у каждой - её сценарий или «Skipped» у карточки без
 * сценария; запускать нечего - почему.
 */
export const CardList = ({ sending, cards, title }: CardListProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.list}>
      <span className={styles.caption}>
        {sending.kind === 'group' ? t('tracker.send.group', { title }) : t('tracker.send.card')}
      </span>
      {!cards.some((card) => card.scenario) ? (
        <p className={styles.note}>{t('tracker.send.none')}</p>
      ) : (
        <ol className={styles.items}>
          {cards.map((card, index) => (
            <CardRow key={card.id} card={card} index={index} />
          ))}
        </ol>
      )}
      {sending.kind === 'group' && <p className={styles.note}>{t('tracker.send.skipped')}</p>}
    </div>
  )
}

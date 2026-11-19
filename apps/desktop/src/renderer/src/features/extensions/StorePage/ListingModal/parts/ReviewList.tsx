import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ListingModal.module.scss'
import type { ReviewListProps } from '../ListingModal.types'
import { dayOf } from '../ListingModal.utils'
import { invoke } from '../../../../../lib/ipc'
import { Stars } from './Stars'

/** Отзывы: автор, оценка, версия и слова; ещё - следующей страницей. */
export const ReviewList = ({ listingId, first }: ReviewListProps) => {
  const { t } = useTranslation()
  const [reviews, setReviews] = useState(first.items)

  const handleMore = async () => {
    const next = await invoke('extensions:storeReviews', { id: listingId, offset: reviews.length })

    if (next.ok) setReviews((current) => [...current, ...next.value.items])
  }

  if (reviews.length === 0)
    return <p className={styles.hint}>{t('extensions.store.listing.noReviews')}</p>

  return (
    <>
      <ul className={styles.reviews}>
        {reviews.map((review) => (
          <li key={`${review.author.id}:${review.updatedAt}`} className={styles.review}>
            <span className={styles.reviewHead}>
              <span className={styles.author}>{review.author.name}</span>
              <Stars value={review.rating} />
            </span>
            {review.text && <p className={styles.reviewText}>{review.text}</p>}
            <span className={styles.when}>
              {t('extensions.store.listing.reviewMeta', {
                day: dayOf(review.updatedAt),
                version: review.version,
              })}
            </span>
          </li>
        ))}
      </ul>
      {reviews.length < first.total && (
        <Button variant="ghost" size="sm" onClick={() => void handleMore()}>
          {t('extensions.store.listing.moreReviews')}
        </Button>
      )}
    </>
  )
}

import { useTranslation } from 'react-i18next'

import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'

import styles from '../ListingModal.module.scss'
import type { ListingPartProps } from '../ListingModal.types'
import { Stars } from './Stars'

/** Средняя оценка крупно и доли оценок полосами - от пятёрок к единицам. */
export const RatingSummary = ({ view }: ListingPartProps) => {
  const { t } = useTranslation()
  const { rating, ratings } = view.listing

  if (rating.count === 0) return <p className={styles.hint}>{t('extensions.store.noRating')}</p>

  return (
    <div className={styles.summary}>
      <div className={styles.stack}>
        <span className={styles.average}>{rating.average.toFixed(1)}</span>
        <Stars value={rating.average} />
      </div>
      <div className={styles.bars}>
        {[5, 4, 3, 2, 1].map((stars) => (
          <span key={stars} className={styles.bar}>
            {stars}
            <ProgressBar
              value={(ratings[stars - 1] ?? 0) / rating.count}
              label={t('extensions.store.listing.stars', { count: stars })}
            />
          </span>
        ))}
      </div>
    </div>
  )
}

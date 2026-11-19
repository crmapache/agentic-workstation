import clsx from 'clsx'
import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../ListingModal.module.scss'
import type { StarsProps } from '../ListingModal.types'

/** Оценка звёздами: показ (без onPick) или выбор - пять кнопок дизайн-системы. */
export const Stars = ({ value, onPick }: StarsProps) => {
  const { t } = useTranslation()
  const marks = [1, 2, 3, 4, 5]

  if (!onPick) {
    return (
      <span
        className={styles.stars}
        role="img"
        aria-label={t('extensions.store.listing.stars', { count: value })}>
        {marks.map((mark) => (
          <Star
            key={mark}
            aria-hidden="true"
            className={clsx(
              styles.starIcon,
              mark > Math.round(value) ? styles.starOff : styles.starOn,
            )}
          />
        ))}
      </span>
    )
  }

  return (
    <span className={styles.stars}>
      {marks.map((mark) => (
        <IconButton
          key={mark}
          icon={Star}
          size="sm"
          active={mark <= value}
          label={t('extensions.store.listing.rate', { count: mark })}
          onClick={() => onPick(mark)}
        />
      ))}
    </span>
  )
}

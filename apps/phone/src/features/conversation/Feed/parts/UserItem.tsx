import { useTranslation } from 'react-i18next'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import styles from '../Feed.module.scss'
import { flag, list, text } from '../Feed.utils'

/** Сообщение человека справа; фото - миниатюрами, что пришли из IDE. */
export const UserItem = ({ item }: { item: FeedItemWire }) => {
  const { t } = useTranslation()
  const thumbnails = list(item, 'images').map((image) =>
    typeof image === 'object' && image && 'thumbnail' in image ? String(image.thumbnail) : '',
  )
  const auto = text(item, 'auto')

  return (
    <div className={styles.userRow}>
      <div className={styles.userBubble}>
        {(auto || flag(item, 'steering')) && (
          <span className={styles.userMark}>{auto ? t('feed.auto') : t('feed.steering')}</span>
        )}
        {thumbnails.length > 0 && (
          <div className={styles.thumbnails}>
            {thumbnails.map((thumbnail, index) =>
              thumbnail.startsWith('data:image/') ? (
                <img
                  key={index}
                  className={styles.thumbnail}
                  src={thumbnail}
                  alt={t('feed.photo')}
                />
              ) : (
                <span key={index} className={styles.thumbnailEmpty}>
                  {t('feed.photo')}
                </span>
              ),
            )}
          </div>
        )}
        {text(item, 'text') && <p className={styles.userText}>{text(item, 'text')}</p>}
      </div>
    </div>
  )
}

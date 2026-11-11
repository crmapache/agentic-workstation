import { useTranslation } from 'react-i18next'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import styles from '../Feed.module.scss'
import type { OpenPhoto } from '../Feed.types'
import { flag, list, text } from '../Feed.utils'

/**
 * Сообщение человека справа; фото - миниатюрами, что пришли из IDE. Миниатюра нажимается: фото
 * открывается крупно, а целиком (или уменьшенным под экран) его приносит IDE.
 */
export const UserItem = ({
  item,
  onOpenPhoto,
}: {
  item: FeedItemWire
  onOpenPhoto: (photo: OpenPhoto) => void
}) => {
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
            {thumbnails.map((thumbnail, index) => (
              <button
                key={index}
                type="button"
                className={styles.thumbnailButton}
                aria-label={t('photo.open', { number: index + 1 })}
                onClick={() => onOpenPhoto({ messageId: item.id, index, thumbnail })}>
                {thumbnail.startsWith('data:image/') ? (
                  <img className={styles.thumbnail} src={thumbnail} alt="" />
                ) : (
                  <span className={styles.thumbnailEmpty}>{t('feed.photo')}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {text(item, 'text') && <p className={styles.userText}>{text(item, 'text')}</p>}
      </div>
    </div>
  )
}

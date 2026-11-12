import { Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../Feed.module.scss'
import type { OpenPhoto } from '../Feed.types'
import { flag, list, text, canRewind } from '../Feed.utils'

/**
 * Сообщение человека справа; фото - миниатюрами, что пришли из IDE. Миниатюра нажимается: фото
 * открывается крупно, а целиком (или уменьшенным под экран) его приносит IDE. Сообщение, с
 * которого начинался ход, можно откатить - кнопка слева от него, у нижнего края.
 */
export const UserItem = ({
  item,
  onOpenPhoto,
  onRewind,
}: {
  item: FeedItemWire
  onOpenPhoto: ((photo: OpenPhoto) => void) | undefined
  onRewind: ((messageId: string) => void) | undefined
}) => {
  const { t } = useTranslation()
  const thumbnails = list(item, 'images').map((image) =>
    typeof image === 'object' && image && 'thumbnail' in image ? String(image.thumbnail) : '',
  )
  const auto = text(item, 'auto')

  return (
    <div className={styles.userRow}>
      {onRewind && canRewind(item) && (
        <IconButton
          icon={Undo2}
          size="touch"
          label={t('feed.rewind')}
          onClick={() => onRewind(item.id)}
        />
      )}
      <div className={styles.userBubble}>
        {(auto || flag(item, 'steering')) && (
          <span className={styles.userMark}>{auto ? t('feed.auto') : t('feed.steering')}</span>
        )}
        {thumbnails.length > 0 && (
          <div className={styles.thumbnails}>
            {thumbnails.map((thumbnail, index) => {
              const image = thumbnail.startsWith('data:image/') ? (
                <img className={styles.thumbnail} src={thumbnail} alt="" />
              ) : (
                <span className={styles.thumbnailEmpty}>{t('feed.photo')}</span>
              )

              return onOpenPhoto ? (
                <button
                  key={index}
                  type="button"
                  className={styles.thumbnailButton}
                  aria-label={t('photo.open', { number: index + 1 })}
                  onClick={() => onOpenPhoto({ messageId: item.id, index, thumbnail })}>
                  {image}
                </button>
              ) : (
                <span key={index} className={styles.thumbnailButton}>
                  {image}
                </span>
              )
            })}
          </div>
        )}
        {text(item, 'text') && <p className={styles.userText}>{text(item, 'text')}</p>}
      </div>
    </div>
  )
}

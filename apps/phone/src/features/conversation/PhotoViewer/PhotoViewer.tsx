import { useTranslation } from 'react-i18next'

import { Lightbox } from '@agentic-workstation/ui/Lightbox'

import type { OpenPhoto } from '../Feed/Feed.types'
import { useMessageImage } from '../../../state/remote.queries'
import { photoCaption } from './PhotoViewer.utils'

/**
 * Фото сообщения крупно. Миниатюра видна сразу, пока IDE несёт фото; пришло - оно на её месте.
 * Целиком фото весит мегабайты, а ответ IDE - один кадр: IDE уменьшает его под экран телефона и
 * говорит об этом, а не пришло - остаётся миниатюра со словами, где оригинал.
 */
export const PhotoViewer = ({
  agentId,
  conversationId,
  photo,
  onClose,
}: {
  agentId: string
  conversationId: string
  photo: OpenPhoto | null
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const image = useMessageImage(
    agentId,
    conversationId,
    photo && { messageId: photo.messageId, index: photo.index },
  )
  const preview = photo?.thumbnail.startsWith('data:image/') ? photo.thumbnail : null
  const caption = photoCaption(t, image, preview !== null)

  return (
    <Lightbox
      open={photo !== null}
      src={image.data?.dataUrl ?? preview}
      alt={t('feed.photo')}
      loadingLabel={t('photo.loading')}
      error={image.isError && !preview ? caption : undefined}
      caption={caption}
      closeLabel={t('common.close')}
      closeSize="touch"
      onClose={onClose}
    />
  )
}

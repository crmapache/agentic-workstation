import { useTranslation } from 'react-i18next'

import { Lightbox } from '@agentic-workstation/ui/Lightbox'

import styles from '../UserMessage.module.scss'
import type { MessageImagesProps } from '../UserMessage.types'
import { useMessageImage } from '../../claude.queries'
import { useFeedScope } from '../../feed-scope.context'
import { ImageTile } from '../../ImageTile/ImageTile'

/**
 * Картинки сообщения миниатюрами; нажатая (или её чип в тексте) открывается крупно.
 * Сама картинка едет из главного процесса только тогда: в ленте держать мегабайты
 * незачем. Не нашлась - крупный просмотр говорит это словами, а не грузится вечно.
 */
export const MessageImages = ({ item, opened, onOpen }: MessageImagesProps) => {
  const { t } = useTranslation()
  const { conversationId } = useFeedScope()
  const full = useMessageImage(conversationId, item.id, opened)
  const isMissing = full.isError || (full.isSuccess && !full.data)
  const label = (index: number) => t('claudeCode.message.openImage', { number: index + 1 })

  const handleClose = () => onOpen(null)

  return (
    <>
      {item.images.length > 0 && (
        <div className={styles.imageGrid}>
          {item.images.map((image, index) => (
            <ImageTile
              key={index}
              src={image.thumbnail}
              label={label(index)}
              onOpen={() => onOpen(index)}
            />
          ))}
        </div>
      )}
      {opened !== null && (
        <Lightbox
          open
          src={full.data ?? null}
          alt={label(opened)}
          loadingLabel={t('claudeCode.message.imageLoading')}
          error={isMissing ? t('claudeCode.message.imageMissing') : undefined}
          closeLabel={t('claudeCode.message.closeImage')}
          onClose={handleClose}
        />
      )}
    </>
  )
}

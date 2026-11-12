import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { REMOVE_ICON_SIZE } from '../Composer.constants'
import styles from '../Composer.module.scss'
import type { PreparedImage } from '../../../lib/images'

/** Фото над полем: превью и крестик - вся плитка нажимается, чтобы убрать. */
export const ImageStrip = ({
  images,
  onRemove,
}: {
  images: PreparedImage[]
  onRemove: (id: string) => void
}) => {
  const { t } = useTranslation()

  return (
    <div className={styles.strip}>
      {images.map((image, index) => (
        <button
          key={image.id}
          type="button"
          className={styles.tile}
          aria-label={t('composer.removePhoto', { number: index + 1 })}
          onClick={() => onRemove(image.id)}>
          <img className={styles.preview} src={image.preview} alt="" />
          <span className={styles.remove}>
            <X size={REMOVE_ICON_SIZE} aria-hidden />
          </span>
        </button>
      ))}
    </div>
  )
}

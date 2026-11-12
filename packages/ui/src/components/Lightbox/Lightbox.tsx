import type { MouseEvent } from 'react'
import { X } from 'lucide-react'

import { useModalDialog } from '../Dialog/Dialog.hooks'
import { IconButton } from '../IconButton/IconButton'
import styles from './Lightbox.module.scss'
import type { LightboxProps } from './Lightbox.types'

/**
 * Картинка крупно поверх окна: скриншот из сообщения, вложение. Не вопрос, как Dialog,
 * а просмотр - закрывается крестиком, Esc и щелчком мимо картинки. Большая картинка
 * вписывается в окно, маленькая остаётся своего размера. Не нашлась - error словами; показана
 * не та, что в оригинале (уменьшена, миниатюра), - caption под ней.
 */
export const Lightbox = ({
  open,
  src,
  alt,
  loadingLabel,
  error,
  caption,
  closeLabel,
  closeSize = 'md',
  onClose,
}: LightboxProps) => {
  const ref = useModalDialog(open)

  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    // Щелчок по самому диалогу (затемнённым полям вокруг картинки) - мимо картинки.
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-label={alt}
      className={styles.lightbox}
      onClose={onClose}
      onClick={handleClick}>
      {src ? (
        <figure className={styles.figure}>
          <img className={styles.image} src={src} alt={alt} />
          {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
        </figure>
      ) : error ? (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      ) : (
        <div className={styles.loading}>{loadingLabel}</div>
      )}
      <div className={styles.close}>
        <IconButton icon={X} size={closeSize} label={closeLabel} onClick={onClose} />
      </div>
    </dialog>
  )
}

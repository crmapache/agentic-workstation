import { X, ImageIcon } from 'lucide-react'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../claude.constants'
import styles from './ImageTile.module.scss'
import type { ImageTileProps } from './ImageTile.types'

/**
 * Квадратная плитка картинки: вложение в поле ввода (с крестиком) или картинка в
 * сообщении (по нажатию открывается крупно). Картинка заполняет плитку, края
 * обрезаются - видно, что это, а целиком она в Lightbox.
 */
export const ImageTile = ({ src, label, onOpen, onRemove, removeLabel }: ImageTileProps) => {
  const picture = src ? (
    <img className={styles.image} src={src} alt={label} />
  ) : (
    <ImageIcon size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
  )

  return (
    <div className={styles.imageTile}>
      {onOpen ? (
        <button type="button" className={styles.open} aria-label={label} onClick={onOpen}>
          {picture}
        </button>
      ) : (
        <div className={styles.open}>{picture}</div>
      )}
      {onRemove && removeLabel && (
        <div className={styles.remove}>
          <IconButton icon={X} size="sm" label={removeLabel} onClick={onRemove} />
        </div>
      )}
    </div>
  )
}

import clsx from 'clsx'

import { IconPlaque } from '../IconPlaque/IconPlaque'
import styles from './Tile.module.scss'
import type { TileProps } from './Tile.types'

/**
 * Плитка-кнопка для сетки: иконка в плашке тона, заголовок, одна-две строки под ним и
 * состояние в правом верхнем углу. Нажатие открывает подробности рядом (лист, экран).
 * Плитки встают сеткой в несколько колонок и переносятся - в отличие от Card, которая не
 * нажимается и держит содержимое в себе, и MenuItem, который строка списка.
 */
export const Tile = ({
  icon,
  iconTone = 'neutral',
  title,
  description,
  wrapDescription = false,
  meta,
  status,
  variant = 'solid',
  muted = false,
  selected = false,
  onClick,
}: TileProps) => (
  <button
    type="button"
    aria-pressed={selected}
    className={clsx(
      styles.tile,
      styles[variant],
      muted && styles.muted,
      selected && styles.selected,
    )}
    onClick={onClick}>
    <IconPlaque icon={icon} tone={iconTone} muted={muted} />
    <span className={styles.text}>
      <span className={styles.head}>
        <span className={styles.title}>{title}</span>
        {status && <span className={styles.status}>{status}</span>}
      </span>
      {description && (
        <span className={clsx(styles.description, wrapDescription && styles.wrap)}>
          {description}
        </span>
      )}
      {meta && <span className={styles.meta}>{meta}</span>}
    </span>
  </button>
)

import clsx from 'clsx'

import { PLAQUE_ICON_SIZE, PLAQUE_ICON_STROKE_WIDTH } from './IconPlaque.constants'
import styles from './IconPlaque.module.scss'
import type { IconPlaqueProps } from './IconPlaque.types'

/**
 * Иконка в тонированной плашке: чей это предмет (тип коннектора, вид). Стоит перед
 * заголовком плитки, вида и окна. Декоративная: рядом всегда есть имя текстом. Значок с
 * буквами проекта - Avatar.
 */
export const IconPlaque = ({
  icon: Icon,
  tone = 'neutral',
  size = 'md',
  muted = false,
}: IconPlaqueProps) => (
  <span
    aria-hidden
    className={clsx(styles.plaque, styles[size], muted ? styles.muted : styles[tone])}>
    <Icon size={PLAQUE_ICON_SIZE[size]} strokeWidth={PLAQUE_ICON_STROKE_WIDTH} />
  </span>
)

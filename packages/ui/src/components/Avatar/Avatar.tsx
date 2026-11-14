import clsx from 'clsx'

import { AVATAR_ICON_SIZE, AVATAR_ICON_STROKE_WIDTH } from './Avatar.constants'
import styles from './Avatar.module.scss'
import type { AvatarProps } from './Avatar.types'

/**
 * Цветной квадрат с инициалами или знаком (icon): значок проекта в шапке, позже - аккаунта или
 * провайдера. Декоративный: рядом всегда есть имя текстом. Знак в крупной плашке - IconPlaque.
 */
export const Avatar = ({ initials, icon: Icon, tone }: AvatarProps) => (
  <span aria-hidden className={clsx(styles.avatar, styles[`tone${tone}`])}>
    {Icon ? <Icon size={AVATAR_ICON_SIZE} strokeWidth={AVATAR_ICON_STROKE_WIDTH} /> : initials}
  </span>
)

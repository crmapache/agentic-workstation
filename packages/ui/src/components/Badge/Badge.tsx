import clsx from 'clsx'

import styles from './Badge.module.scss'
import type { BadgeProps } from './Badge.types'

/**
 * Метка состояния: точка цвета состояния и короткий текст. Статус в строке списка,
 * счётчик, «ahead 2» у ветки. Со значком - о чём метка: срок, приоритет, сценарий на
 * карточке. Это не кнопка - нажимать на неё нечего.
 */
export const Badge = ({
  tone = 'neutral',
  variant = 'marker',
  icon: Icon,
  iconLabel,
  children,
}: BadgeProps) => (
  <span className={clsx(styles.badge, styles[tone], styles[variant], Icon && styles.withIcon)}>
    {Icon &&
      (iconLabel ? (
        <Icon className={styles.icon} role="img" aria-label={iconLabel} />
      ) : (
        <Icon className={styles.icon} aria-hidden />
      ))}
    {children}
  </span>
)

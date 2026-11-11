import clsx from 'clsx'

import styles from './Banner.module.scss'
import type { BannerProps } from './Banner.types'

/**
 * Полоса под шапкой экрана, одна на всё приложение: IDE не отвечает или хранилище не держит
 * пары (warning), IDE отпустила телефон или разговор не идёт (danger).
 */
export const Banner = ({ tone, text }: BannerProps) => (
  <p role="status" className={clsx(styles.banner, styles[tone])}>
    {text}
  </p>
)

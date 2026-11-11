import clsx from 'clsx'

import styles from './Banner.module.scss'

/** Полоса под шапкой экрана: связи нет (warning), что-то сломано (danger). */
export const Banner = ({ tone, text }: { tone: 'warning' | 'danger'; text: string }) => (
  <p role="status" className={clsx(styles.banner, styles[tone])}>
    {text}
  </p>
)

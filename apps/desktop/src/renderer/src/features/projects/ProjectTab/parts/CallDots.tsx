import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from '../ProjectTab.module.scss'
import type { CallDotsProps } from '../ProjectTab.types'
import { callDots } from '../ProjectTab.utils'

/**
 * Точки зова на вкладке проекта: по точке на позвавший разговор, цветом повода - зелёная
 * «закончил», оранжевая «ждёт тебя», красная «сломалось». Сверх трёх - «+N» старых слева.
 * Для скринридера - одним именем: какие чаты и чем позвали.
 */
export const CallDots = ({ calls }: CallDotsProps) => {
  const { t } = useTranslation()
  const { shown, hidden } = callDots(calls)

  return (
    <span
      role="img"
      aria-label={calls.map((call) => call.text).join('; ')}
      className={styles.callDots}>
      {hidden > 0 && (
        <span className={styles.moreCalls}>{t('projects.moreCalls', { count: hidden })}</span>
      )}
      {shown.map((call) => (
        <span key={call.id} className={clsx(styles.callDot, styles[call.tone])} />
      ))}
    </span>
  )
}

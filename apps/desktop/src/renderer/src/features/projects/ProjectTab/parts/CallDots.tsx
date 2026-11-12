import { useTranslation } from 'react-i18next'

import { CallBeacon } from '@agentic-workstation/ui/CallBeacon'

import styles from '../ProjectTab.module.scss'
import type { CallDotsProps } from '../ProjectTab.types'
import { callDots } from '../ProjectTab.utils'

/**
 * Маячки зова на вкладке проекта: по маячку на позвавший разговор, цветом повода - зелёный
 * «закончил», оранжевый «ждёт тебя», красный «сломалось» (CallBeacon). Сверх трёх - «+N» старых слева. Для скринридера - одним именем: какие чаты и чем
 * позвали.
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
        <CallBeacon key={call.id} tone={call.tone} since={call.at} />
      ))}
    </span>
  )
}

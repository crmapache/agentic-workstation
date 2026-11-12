import type { CSSProperties } from 'react'
import clsx from 'clsx'

import { BEACON_PHASE_SPAN_MS } from './CallBeacon.constants'
import styles from './CallBeacon.module.scss'
import type { CallBeaconProps } from './CallBeacon.types'

/**
 * Маячок зова: ядро цветом повода, вокруг полупрозрачный дышащий ореол, от ядра расходится и
 * тает волна. Знак того, что где-то позвали человека, вне самой позвавшей вкладки (у неё свет -
 * ClosableTab call): на вкладке проекта по маячку на разговор. Крупнее точки состояния - его
 * ищут взглядом через всю полосу. Только рисунок: имя для скринридера даёт тот, кто его ставит.
 */
export const CallBeacon = ({ tone, since }: CallBeaconProps) => {
  const phase = since === undefined ? 0 : -(since % BEACON_PHASE_SPAN_MS)

  return (
    <span
      className={clsx(styles.callBeacon, styles[tone])}
      // eslint-disable-next-line no-restricted-syntax -- фаза - от момента зова, у каждого маячка своя
      style={{ '--beacon-phase': `${phase}ms` } as CSSProperties}
      aria-hidden>
      <span className={styles.ripple} />
    </span>
  )
}

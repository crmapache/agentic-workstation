import clsx from 'clsx'

import { SPINNER_BOX, SPINNER_RING, SPINNER_CENTER, SPINNER_PATH_LENGTH } from './Spinner.constants'
import styles from './Spinner.module.scss'
import type { SpinnerProps } from './Spinner.types'

/**
 * Знак «идёт работа» на месте иконки: бледное кольцо, по которому бежит дуга тона - то
 * вытягивается, то догоняет себя. Вращается весь рисунок вокруг центра своего поля, поэтому
 * ось не гуляет ни на каком размере. around - то же кольцо вокруг знака (номер остановки),
 * на всю коробку родителя. Когда доля известна - ProgressBar или RingMeter.
 */
export const Spinner = ({ size = 'sm', tone = 'accent', label }: SpinnerProps) => {
  const { radius, stroke } = SPINNER_RING[size]

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={clsx(styles.spinner, styles[size], styles[tone])}>
      {/* eslint-disable-next-line no-restricted-syntax -- знак рисуется дугой с анимацией длины, а не иконкой */}
      <svg className={styles.ring} viewBox={`0 0 ${SPINNER_BOX} ${SPINNER_BOX}`} aria-hidden>
        <circle
          className={styles.track}
          cx={SPINNER_CENTER}
          cy={SPINNER_CENTER}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className={styles.arc}
          cx={SPINNER_CENTER}
          cy={SPINNER_CENTER}
          r={radius}
          strokeWidth={stroke}
          pathLength={SPINNER_PATH_LENGTH}
        />
      </svg>
    </span>
  )
}

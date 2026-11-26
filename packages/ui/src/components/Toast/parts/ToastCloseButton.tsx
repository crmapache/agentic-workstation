import clsx from 'clsx'
import { X } from 'lucide-react'

import {
  COUNTDOWN_BOX,
  COUNTDOWN_CENTER,
  COUNTDOWN_LENGTH,
  COUNTDOWN_RADIUS,
  COUNTDOWN_STROKE,
} from '../Toast.constants'
import styles from '../Toast.module.scss'
import type { ToastCloseButtonProps } from '../Toast.types'
import { IconButton } from '../../IconButton/IconButton'

/**
 * Крестик карточки. С самозакрытием - круглый и в кольце, которое тает до конца отсчёта; кольцо
 * лежит поверх кнопки и пропускает нажатия к ней. Часы кольца ведёт useCountdown карточки.
 */
export const ToastCloseButton = ({ close, arcRef }: ToastCloseButtonProps) => {
  const hasCountdown = close.autoCloseMs !== undefined

  return (
    <span className={clsx(styles.close, hasCountdown && styles.ringed)}>
      <IconButton
        icon={X}
        size="sm"
        round={hasCountdown}
        label={close.label}
        onClick={close.onClose}
      />
      {hasCountdown && (
        // eslint-disable-next-line no-restricted-syntax -- кольцо отсчёта - данные, а не иконка
        <svg
          className={styles.countdown}
          viewBox={`0 0 ${COUNTDOWN_BOX} ${COUNTDOWN_BOX}`}
          aria-hidden>
          <circle
            className={styles.countdownTrack}
            cx={COUNTDOWN_CENTER}
            cy={COUNTDOWN_CENTER}
            r={COUNTDOWN_RADIUS}
            strokeWidth={COUNTDOWN_STROKE}
          />
          <circle
            ref={arcRef}
            className={styles.countdownArc}
            cx={COUNTDOWN_CENTER}
            cy={COUNTDOWN_CENTER}
            r={COUNTDOWN_RADIUS}
            strokeWidth={COUNTDOWN_STROKE}
            strokeDasharray={COUNTDOWN_LENGTH}
          />
        </svg>
      )}
    </span>
  )
}

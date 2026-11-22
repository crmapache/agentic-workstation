import clsx from 'clsx'

import { ProgressBar } from '../ProgressBar/ProgressBar'
import { useCountdown } from './Toast.hooks'
import styles from './Toast.module.scss'
import type { ToastProps } from './Toast.types'
import { ToastCloseButton } from './parts/ToastCloseButton'

/**
 * Карточка уведомления: заголовок с крестиком, пояснение, полоса прогресса, действия. С
 * autoCloseMs уходит сама, пока её не держат мышью (кольцо вокруг крестика показывает, сколько
 * осталось). Сама себя не позиционирует - её кладут в зону уведомлений окна, которая и решает,
 * где и в каком порядке они стоят.
 */
export const Toast = ({
  title,
  description,
  tone = 'neutral',
  progress,
  actions,
  close,
}: ToastProps) => {
  const { arcRef, holdProps } = useCountdown(close?.autoCloseMs, () => close?.onClose())

  return (
    <div role="status" className={clsx(styles.toast, styles[tone])} {...holdProps}>
      <div className={styles.header}>
        <div className={styles.title}>{title}</div>
        {close && <ToastCloseButton close={close} arcRef={arcRef} />}
      </div>
      {description && <div className={styles.description}>{description}</div>}
      {progress !== undefined && (
        <div className={styles.progress}>
          <ProgressBar value={progress} label={title} />
        </div>
      )}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}

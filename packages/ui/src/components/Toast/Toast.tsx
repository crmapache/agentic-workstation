import { useId } from 'react'
import clsx from 'clsx'

import { ProgressBar } from '../ProgressBar/ProgressBar'
import { useFold, useCountdown } from './Toast.hooks'
import styles from './Toast.module.scss'
import type { ToastProps } from './Toast.types'
import { ToastTools } from './parts/ToastTools'

/**
 * Карточка уведомления: заголовок (над ним, по желанию, от кого) с крестиком, пояснение, полоса
 * прогресса, действия. С autoCloseMs уходит сама, пока её не держат мышью (кольцо вокруг
 * крестика показывает, сколько осталось). С more длинное пояснение свёрнуто до нескольких строк,
 * стрелка у крестика раскрывает его здесь же. Сама себя не позиционирует - её кладут в зону
 * уведомлений окна, которая и решает, где и в каком порядке они стоят.
 */
export const Toast = ({
  title,
  eyebrow,
  description,
  more,
  tone = 'neutral',
  progress,
  actions,
  expand,
  close,
}: ToastProps) => {
  const textId = useId()
  const { textRef, isExpanded, canFold, toggle } = useFold(description, more !== undefined)
  // Раскрыл длинное - значит, читает: раскрытая карточка сама не уходит, а свёрнутая снова
  // отсчитывает с начала.
  const autoCloseMs = isExpanded ? undefined : close?.autoCloseMs
  const { arcRef, holdProps } = useCountdown(autoCloseMs, () => close?.onClose())

  return (
    <div
      role="status"
      className={clsx(styles.toast, styles[tone], isExpanded && styles.expanded)}
      {...holdProps}>
      {/* Первая строка - та, у которой точка тона и кнопки: «от кого», а без него - заголовок. */}
      <div className={clsx(styles.header, eyebrow ? styles.eyebrow : styles.title)}>
        <div className={styles.lead}>{eyebrow || title}</div>
        <ToastTools
          fold={more && canFold ? { more, isExpanded, textId, onToggle: toggle } : undefined}
          expand={expand}
          close={close && { ...close, autoCloseMs }}
          arcRef={arcRef}
        />
      </div>
      {eyebrow && <div className={styles.title}>{title}</div>}
      {description && (
        <div
          ref={textRef}
          id={textId}
          className={clsx(
            styles.description,
            more && (isExpanded ? styles.unfolded : styles.folded),
          )}>
          {description}
        </div>
      )}
      {progress !== undefined && (
        <div className={styles.progress}>
          <ProgressBar value={progress} label={title} />
        </div>
      )}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from './ActivityBar.module.scss'
import type { ActivityBarProps } from './ActivityBar.types'

/**
 * Вертикальная полоса иконок: зона 2 переключает виды левой панели, зона 3 - GUI
 * провайдеров LLM справа, зона 8 - виды середины окна. Один компонент на все три.
 * Подсказка встаёт в сторону от края полосы, чтобы не закрыть соседние иконки. Внизу
 * полосы - то, что открывается под областью (терминал под панелью провайдера, ADR 0037).
 */
export const ActivityBar = <ViewId extends string>({
  views,
  activeViewId,
  isPanelOpen,
  edge,
  label,
  footer,
  badges,
  onSelect,
}: ActivityBarProps<ViewId>) => {
  const { t } = useTranslation()
  const tooltipPlacement = edge === 'start' ? 'end' : 'start'

  return (
    <nav aria-label={label} className={styles.activityBar}>
      {views.map((view) => {
        const count: number = badges?.[view.id] ?? 0

        return (
          <span key={view.id} className={styles.item}>
            <IconButton
              icon={view.icon}
              label={
                count > 0
                  ? t('activityBar.waiting', { label: t(view.labelKey), count })
                  : t(view.labelKey)
              }
              active={isPanelOpen && view.id === activeViewId}
              tooltipPlacement={tooltipPlacement}
              onClick={() => onSelect(view.id)}
            />
            {count > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </span>
        )
      })}
      {footer && <div className={styles.footer}>{footer}</div>}
    </nav>
  )
}

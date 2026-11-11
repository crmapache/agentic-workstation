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
  onSelect,
}: ActivityBarProps<ViewId>) => {
  const { t } = useTranslation()
  const tooltipPlacement = edge === 'start' ? 'end' : 'start'

  return (
    <nav aria-label={label} className={styles.activityBar}>
      {views.map((view) => (
        <IconButton
          key={view.id}
          icon={view.icon}
          label={t(view.labelKey)}
          active={isPanelOpen && view.id === activeViewId}
          tooltipPlacement={tooltipPlacement}
          onClick={() => onSelect(view.id)}
        />
      ))}
      {footer && <div className={styles.footer}>{footer}</div>}
    </nav>
  )
}

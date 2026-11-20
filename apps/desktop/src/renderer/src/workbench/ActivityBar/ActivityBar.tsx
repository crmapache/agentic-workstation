import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { viewLabel } from '../views/view-label'
import styles from './ActivityBar.module.scss'
import type { ActivityBarProps } from './ActivityBar.types'

/**
 * Вертикальная полоса иконок: зона 2 переключает виды левой панели, зона 3 - GUI
 * провайдеров LLM справа, зона 8 - виды середины окна. Один компонент на все три.
 * Подсказка встаёт в сторону от края полосы, чтобы не закрыть соседние иконки. Внизу
 * полосы - то, что открывается под областью (терминал под панелью провайдера, ADR 0037).
 * На углу иконки - число того, что ждёт человека, или, когда его нет, точка: у вида что-то
 * изменилось. Вид, где кто-то позвал человека, горит светом зова, пока его не покажут.
 */
export const ActivityBar = <ViewId extends string>({
  views,
  activeViewId,
  isPanelOpen,
  edge,
  label,
  footer,
  badges,
  marks,
  calls,
  onSelect,
}: ActivityBarProps<ViewId>) => {
  const { t } = useTranslation()
  const tooltipPlacement = edge === 'start' ? 'end' : 'start'

  return (
    <nav aria-label={label} className={styles.activityBar}>
      {views.map((view) => {
        const count: number = badges?.[view.id] ?? 0
        const mark = count > 0 ? undefined : marks?.[view.id]
        const isShown = isPanelOpen && view.id === activeViewId
        const call = isShown ? undefined : calls?.[view.id]

        return (
          <span key={view.id} className={styles.item}>
            <IconButton
              icon={view.icon}
              label={
                count > 0
                  ? t('activityBar.waiting', { label: viewLabel(view, t), count })
                  : (call?.label ?? mark?.label ?? viewLabel(view, t))
              }
              active={isShown}
              tooltipPlacement={tooltipPlacement}
              // Свет стоит в кнопке всегда, когда полоса его знает: гаснет плавно, а не пропадает.
              call={calls ? (call?.tone ?? null) : undefined}
              callSince={call?.at}
              onClick={() => onSelect(view.id)}
            />
            {count > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {count > 9 ? '9+' : count}
              </span>
            )}
            {mark && <span className={clsx(styles.mark, styles[mark.tone])} aria-hidden="true" />}
          </span>
        )
      })}
      {footer && <div className={styles.footer}>{footer}</div>}
    </nav>
  )
}

import { useCallback } from 'react'
import clsx from 'clsx'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../ActivityBar.module.scss'
import type { BarButtonProps } from '../ActivityBar.types'

/**
 * Кнопка полосы: иконка, на углу - число того, что ждёт человека, или точка, что у вида что-то
 * изменилось. Её же несут рукой: она едет за курсором, соседи уступают место. Ручка - сама
 * иконка (data-drag-handle), клик, которым кончается жест, кнопку не нажимает.
 */
export const BarButton = ({
  button,
  tooltipPlacement,
  view,
  register,
  onPress,
}: BarButtonProps) => {
  const { id, count, mark } = button
  const isLifted = view.draggedId === id
  const offset = isLifted ? view.offset : view.shifts[id]

  const handleRef = useCallback((node: HTMLDivElement | null) => register(id, node), [register, id])

  return (
    <div
      ref={handleRef}
      className={clsx(styles.item, isLifted && styles.lifted)}
      data-bar-button={id}
      // eslint-disable-next-line no-restricted-syntax -- сдвиг под рукой меняется на лету
      style={offset ? { transform: `translateY(${offset}px)` } : undefined}
      onMouseDown={(event) => onPress(event, id)}>
      <IconButton
        icon={button.icon}
        label={button.label}
        active={button.active}
        tooltipPlacement={tooltipPlacement}
        call={button.call}
        callSince={button.callSince}
        data-drag-handle=""
        onClick={button.onClick}
      />
      {count > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {count > 9 ? '9+' : count}
        </span>
      )}
      {mark && <span className={clsx(styles.mark, styles[mark.tone])} aria-hidden="true" />}
    </div>
  )
}

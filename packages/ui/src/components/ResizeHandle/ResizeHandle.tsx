import clsx from 'clsx'

import { EDGE_AXIS } from './ResizeHandle.constants'
import { useResizeDrag } from './ResizeHandle.hooks'
import styles from './ResizeHandle.module.scss'
import type { ResizeHandleProps } from './ResizeHandle.types'

/**
 * Невидимая ручка у края панели: тянешь мышью или двигаешь стрелками - панель меняет
 * ширину (боковой край) или высоту (верх и низ: терминал под панелью). Между листами окна
 * (inGap) - посередине зазора, внутри листа - на разделительной линии. Сам размер и его
 * пределы держит тот, кто ручку поставил.
 */
export const ResizeHandle = ({ edge, inGap = false, label, onResize }: ResizeHandleProps) => {
  const axis = EDGE_AXIS[edge]
  const { handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown } = useResizeDrag(
    axis,
    onResize,
  )

  return (
    <div
      role="separator"
      // Разделитель между панелями слева и справа - вертикальная линия, сверху и снизу -
      // горизонтальная.
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      tabIndex={0}
      className={clsx(styles.handle, styles[axis], styles[edge], inGap && styles.inGap)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
    />
  )
}

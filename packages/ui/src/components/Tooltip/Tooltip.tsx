import clsx from 'clsx'

import { useTooltip } from './Tooltip.hooks'
import styles from './Tooltip.module.scss'
import type { TooltipProps } from './Tooltip.types'
import { TooltipDetailsBody } from './parts/TooltipDetailsBody'

/**
 * Подсказка над элементом вместо системного title: стеклянная, в стиле окна, и
 * появляется с задержкой при наведении или фокусе с клавиатуры. Держится на
 * popover="hint" и CSS anchor positioning. С details - справка в несколько строк
 * (показание и его числа), без - строка текста. Для скринридера не дублируется: у
 * элемента внутри должно быть своё имя (aria-label или текст).
 */
export const Tooltip = ({
  label,
  placement = 'bottom',
  details,
  stretch = false,
  disabled = false,
  children,
}: TooltipProps) => {
  const { anchorRef, tooltipRef, handlers } = useTooltip(disabled)

  return (
    <span ref={anchorRef} className={clsx(styles.anchor, stretch && styles.stretch)} {...handlers}>
      {children}
      <span
        ref={tooltipRef}
        popover="hint"
        aria-hidden
        className={clsx(styles.tooltip, details && styles.details, styles[placement])}>
        {details ? <TooltipDetailsBody title={label} details={details} /> : label}
      </span>
    </span>
  )
}

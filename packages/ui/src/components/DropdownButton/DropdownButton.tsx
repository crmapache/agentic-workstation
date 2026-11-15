import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'

import { CHEVRON_SIZE, CHEVRON_STROKE_WIDTH } from './DropdownButton.constants'
import styles from './DropdownButton.module.scss'
import type { DropdownButtonProps } from './DropdownButton.types'

/**
 * Тихая кнопка с текущим значением и стрелкой вниз: открывает список, из которого
 * выбирают (проект, ветка; в размере sm - модель, усилие и режим под полем ввода). Без
 * стрелки (chevron false) - значение, которое и так читается выбором: дата между стрелками. Сам
 * список рисует тот, кто кнопку поставил. Длинное значение режется многоточием.
 */
export const DropdownButton = ({
  label,
  labelContent,
  leading,
  menuLabel,
  size = 'md',
  chevron = true,
  type = 'button',
  ...rest
}: DropdownButtonProps) => (
  <button
    type={type}
    aria-haspopup="menu"
    aria-label={`${menuLabel}: ${label}`}
    className={clsx(styles.dropdownButton, styles[size])}
    {...rest}>
    {leading}
    <span className={styles.label}>{labelContent ?? label}</span>
    {chevron && (
      <ChevronDown
        className={styles.chevron}
        size={CHEVRON_SIZE[size]}
        strokeWidth={CHEVRON_STROKE_WIDTH}
        aria-hidden
      />
    )}
  </button>
)

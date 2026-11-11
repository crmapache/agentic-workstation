import { useId } from 'react'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'

import { CHEVRON_SIZE, CHEVRON_STROKE_WIDTH } from './SelectField.constants'
import styles from './SelectField.module.scss'
import type { SelectFieldProps } from './SelectField.types'

/**
 * Поле выбора формы: подпись над рамкой поля ввода, в рамке - значение и стрелка. Открывает
 * список, который рисует тот, кто поле поставил (Menu в Popover шириной с поле). В отличие от
 * тихой DropdownButton (шапка окна, строка под полем ввода) стоит в форме рядом с TextField и
 * TextArea: та же подпись, та же рамка, и видно, что это поле, а не заголовок.
 */
export const SelectField = ({
  label,
  hideLabel = false,
  value,
  placeholder = '',
  leading,
  fit = false,
  type = 'button',
  ...rest
}: SelectFieldProps) => {
  const id = useId()
  const shown = value ?? placeholder

  return (
    <div className={clsx(styles.selectField, fit && styles.fit)}>
      <label htmlFor={id} className={clsx(styles.label, hideLabel && styles.hidden)}>
        {label}
      </label>
      <button
        id={id}
        type={type}
        aria-haspopup="menu"
        aria-label={`${label}: ${shown}`}
        className={styles.box}
        {...rest}>
        {leading}
        <span className={clsx(styles.value, value === null && styles.placeholder)}>{shown}</span>
        <ChevronDown
          className={styles.chevron}
          size={CHEVRON_SIZE}
          strokeWidth={CHEVRON_STROKE_WIDTH}
          aria-hidden
        />
      </button>
    </div>
  )
}

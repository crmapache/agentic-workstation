import type { ChangeEvent } from 'react'
import { useId } from 'react'
import clsx from 'clsx'

import { FIELD_ICON_SIZE, FIELD_ICON_STROKE_WIDTH } from './TextField.constants'
import styles from './TextField.module.scss'
import type { TextFieldProps } from './TextField.types'

/**
 * Однострочное поле ввода с подписью: имя ветки, адрес репозитория, поиск в меню.
 * Ошибка показывается под полем и связана с ним для скринридера.
 */
export const TextField = ({
  label,
  hideLabel = false,
  value,
  onChange,
  icon: Icon,
  size = 'md',
  error,
  type = 'text',
  ref,
  ...rest
}: TextFieldProps) => {
  const id = useId()
  const errorId = `${id}-error`

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)

  return (
    <div className={styles.textField}>
      <label htmlFor={id} className={clsx(styles.label, hideLabel && styles.hidden)}>
        {label}
      </label>
      <div className={clsx(styles.box, styles[size], error && styles.invalid)}>
        {Icon && (
          <Icon
            className={styles.icon}
            size={FIELD_ICON_SIZE}
            strokeWidth={FIELD_ICON_STROKE_WIDTH}
            aria-hidden
          />
        )}
        <input
          ref={ref}
          id={id}
          type={type}
          value={value}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={styles.input}
          onChange={handleChange}
          {...rest}
        />
      </div>
      {error && (
        <div id={errorId} className={styles.error}>
          {error}
        </div>
      )}
    </div>
  )
}

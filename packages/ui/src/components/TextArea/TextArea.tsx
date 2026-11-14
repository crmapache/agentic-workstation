import type { ChangeEvent } from 'react'
import { useId } from 'react'
import clsx from 'clsx'

import styles from './TextArea.module.scss'
import type { TextAreaProps } from './TextArea.types'

/**
 * Многострочное поле с подписью: описание, заметка - текст в несколько предложений.
 * Растёт с набранным от трёх строк до десяти, дальше прокрутка; resizable - ещё и тянется
 * вниз за уголок, до 400 px. Одна строка (имя, адрес, поиск) - TextField.
 */
export const TextArea = ({
  label,
  hideLabel = false,
  value,
  onChange,
  error,
  resizable = false,
  ref,
  ...rest
}: TextAreaProps) => {
  const id = useId()
  const errorId = `${id}-error`

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)

  return (
    <div className={styles.textArea}>
      <label htmlFor={id} className={clsx(styles.label, hideLabel && styles.hidden)}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        value={value}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={clsx(styles.area, resizable && styles.resizable, error && styles.invalid)}
        onChange={handleChange}
        {...rest}
      />
      {error && (
        <div id={errorId} className={styles.error}>
          {error}
        </div>
      )}
    </div>
  )
}

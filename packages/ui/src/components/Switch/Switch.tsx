import { useId } from 'react'
import clsx from 'clsx'

import { Tooltip } from '../Tooltip/Tooltip'
import styles from './Switch.module.scss'
import type { SwitchProps } from './Switch.types'

/**
 * Строка настройки с переключателем «вкл/выкл»: подпись и пояснение слева, ползунок
 * справа. Нажимается вся строка. labelHidden - один ползунок с подсказкой. Для выбора
 * одного из нескольких - MenuItem с selection, для числа - Slider.
 */
export const Switch = ({
  label,
  description,
  checked,
  disabled = false,
  labelHidden = false,
  onChange,
}: SwitchProps) => {
  const descriptionId = useId()
  const hasDescription = Boolean(description) && !labelHidden

  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelHidden ? label : undefined}
      aria-describedby={hasDescription ? descriptionId : undefined}
      disabled={disabled}
      className={clsx(styles.switch, labelHidden && styles.bare)}
      onClick={() => onChange(!checked)}>
      {!labelHidden && (
        <span className={styles.text}>
          <span className={styles.label}>{label}</span>
          {hasDescription && (
            <span id={descriptionId} className={styles.description}>
              {description}
            </span>
          )}
        </span>
      )}
      <span className={clsx(styles.track, checked && styles.on)} aria-hidden>
        <span className={styles.thumb} />
      </span>
    </button>
  )

  return labelHidden ? <Tooltip label={label}>{button}</Tooltip> : button
}

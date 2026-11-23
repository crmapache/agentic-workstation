import type { MouseEvent } from 'react'
import { useRef, useEffect } from 'react'
import clsx from 'clsx'

import { OPTION_ICON_SIZE, OPTION_ICON_STROKE_WIDTH } from './ListBoxOption.constants'
import styles from './ListBoxOption.module.scss'
import type { ListBoxOptionProps } from './ListBoxOption.types'
import { splitByRanges } from './ListBoxOption.utils'

/**
 * Вариант в ListBox: иконка или значок, подпись с подсвеченными совпадениями, серое
 * пояснение в той же строке и подсказка справа. Одна строка, чтобы в списке поиска
 * помещалось много вариантов; под палец (size touch) - пояснение второй строкой. Пункт меню с
 * фокусом - MenuItem.
 */
export const ListBoxOption = ({
  id,
  label,
  highlight = [],
  code = false,
  description,
  icon: Icon,
  leading,
  hint,
  size = 'md',
  active,
  onSelect,
  onActivate,
}: ListBoxOptionProps) => {
  const ref = useRef<HTMLDivElement>(null)

  // Выделение ушло стрелками за край прокрутки - подтянуть вариант в видимую часть.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // Нажатие не забирает фокус у поля поиска: печатать можно сразу после клика.
  const handleMouseDown = (event: MouseEvent) => event.preventDefault()

  const visual =
    leading ?? (Icon && <Icon size={OPTION_ICON_SIZE} strokeWidth={OPTION_ICON_STROKE_WIDTH} />)

  return (
    <div
      ref={ref}
      id={id}
      role="option"
      aria-selected={active}
      className={clsx(
        styles.listBoxOption,
        size === 'touch' && styles.touch,
        active && styles.active,
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={active ? undefined : onActivate}
      onClick={onSelect}>
      {visual && (
        <span className={styles.visual} aria-hidden>
          {visual}
        </span>
      )}
      <span className={styles.text}>
        <span className={clsx(styles.label, code && styles.code)}>
          {splitByRanges(label, highlight).map((segment, index) =>
            segment.isMatch ? (
              <mark key={index} className={styles.match}>
                {segment.text}
              </mark>
            ) : (
              segment.text
            ),
          )}
        </span>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}

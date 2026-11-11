import { ChoiceMark } from '@agentic-workstation/ui/ChoiceMark'

import styles from './OptionList.module.scss'
import type { OptionListProps } from './OptionList.types'

/**
 * Выбор строками под палец: модель, усилие, режим, вариант ответа. На телефоне список с
 * отметками удобнее выпадающего меню - всё видно сразу, промахнуться трудно.
 */
export const OptionList = <V extends string>({
  label,
  options,
  isSelected,
  onSelect,
  shape = 'circle',
  disabled = false,
}: OptionListProps<V>) => (
  <div
    role={shape === 'circle' ? 'radiogroup' : 'group'}
    aria-label={label}
    className={styles.group}>
    {options.map((option) => {
      const selected = isSelected(option.value)

      return (
        <button
          key={option.value}
          type="button"
          role={shape === 'circle' ? 'radio' : 'checkbox'}
          aria-checked={selected}
          disabled={disabled}
          className={styles.option}
          onClick={() => onSelect(option.value)}>
          <ChoiceMark shape={shape} checked={selected} />
          <span className={styles.texts}>
            <span className={styles.label}>{option.label}</span>
            {option.description && <span className={styles.description}>{option.description}</span>}
          </span>
        </button>
      )
    })}
  </div>
)

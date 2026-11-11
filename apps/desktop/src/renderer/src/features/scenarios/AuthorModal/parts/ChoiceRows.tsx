import { useId } from 'react'
import clsx from 'clsx'

import { ChoiceMark } from '@agentic-workstation/ui/ChoiceMark'

import styles from '../AuthorModal.module.scss'
import type { ChoiceRowsProps } from '../AuthorModal.types'

/**
 * Один ответ из нескольких - строками с отметкой, а не флажком с подписью: выбирают то, что
 * случится (кто увидит сценарий), и это не помещается в слово у галочки. Строка, которую
 * выбрать нельзя, говорит почему - своей второй строкой.
 */
export const ChoiceRows = <Id extends string>({
  label,
  items,
  value,
  disabled = false,
  onChange,
}: ChoiceRowsProps<Id>) => {
  const labelId = useId()

  return (
    <div className={styles.section}>
      <span id={labelId} className={styles.caption}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={styles.choices}>
        {items.map((item) => {
          const isChosen = item.id === value

          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={isChosen}
              disabled={disabled || item.disabled}
              className={clsx(styles.choice, isChosen && styles.choiceOn)}
              onClick={() => onChange(item.id)}>
              <ChoiceMark shape="circle" checked={isChosen} />
              <span className={styles.choiceText}>
                <span className={styles.choiceName}>{item.label}</span>
                <span className={styles.choiceNote}>{item.note}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

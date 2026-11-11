import clsx from 'clsx'

import { ChoiceMark } from '@agentic-workstation/ui/ChoiceMark'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../AuthorModal.module.scss'
import type { ChoiceRowsProps } from '../AuthorModal.types'

/**
 * Один ответ из нескольких - строками с отметкой, а не флажком с подписью: выбирают то, что
 * случится (кто увидит сценарий), и это не помещается в слово у галочки. Строка, которую
 * выбрать нельзя, говорит почему - своей второй строкой. Подпись группы - раздел окна, как в
 * окне запуска.
 */
export const ChoiceRows = <Id extends string>({
  label,
  items,
  value,
  disabled = false,
  onChange,
}: ChoiceRowsProps<Id>) => (
  <Section size="sm" title={label}>
    <div role="radiogroup" aria-label={label} className={styles.choices}>
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
  </Section>
)

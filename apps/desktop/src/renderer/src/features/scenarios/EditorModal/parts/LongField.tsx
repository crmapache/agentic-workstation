import { TextArea } from '@agentic-workstation/ui/TextArea'

import styles from '../EditorModal.module.scss'
import type { LongFieldProps } from '../EditorModal.types'

/**
 * Многострочное поле прозы с подписью капсом, как у остальных частей редактора: брифинг
 * головы, DONE WHEN, HAND ON, что за список. Само поле - TextArea дизайн-системы (растёт с
 * текстом). Промпт карточки - не это поле, а PromptField: там код и подсветка имён.
 */
export const LongField = ({ label, aside, value, placeholder, note, onChange }: LongFieldProps) => (
  <div className={styles.field}>
    {/* Подпись капсом видна глазу; имя поля для скринридера - у самого поля. */}
    <span className={styles.fieldLabel} aria-hidden>
      {label}
      {aside && <span className={styles.aside}>{aside}</span>}
    </span>
    <TextArea label={label} hideLabel value={value} placeholder={placeholder} onChange={onChange} />
    {note && <p className={styles.note}>{note}</p>}
  </div>
)

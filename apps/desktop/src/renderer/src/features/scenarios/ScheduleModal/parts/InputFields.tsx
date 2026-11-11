import { useTranslation } from 'react-i18next'

import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../ScheduleModal.module.scss'
import type { InputFieldsProps } from '../ScheduleModal.types'

/**
 * Вопросы сценария - по полю на вопрос (ScenarioInputs в ACC): против чего делается этот круг
 * работ. Новый час открывается пустым, правка часа - его же ответами. Обязательный вопрос
 * помечен: без ответа час не ставится.
 */
export const InputFields = ({ scenario, values, onChange }: InputFieldsProps) => {
  const { t } = useTranslation()
  // Безымянный вопрос в промпт не вписать: его не спрашивают (так же считает missingInputs).
  const inputs = scenario.inputs.filter((input) => input.name.trim())

  return inputs.map((input) => {
    const label = input.label || input.name

    return (
      <div key={input.id} className={styles.field}>
        {/* Подпись с меткой «обязательно» видна глазу; имя поля для скринридера - у самого поля. */}
        <span className={styles.caption} aria-hidden>
          {label}
          {input.required && (
            <span className={styles.mustFill}>{t('scenarios.schedule.form.mustFill')}</span>
          )}
        </span>
        <TextField
          label={label}
          hideLabel
          value={values[input.name] ?? ''}
          placeholder={input.placeholder}
          aria-required={input.required}
          onChange={(value) => onChange({ ...values, [input.name]: value })}
        />
      </div>
    )
  })
}

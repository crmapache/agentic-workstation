import { useTranslation } from 'react-i18next'

import { TextArea } from '@agentic-workstation/ui/TextArea'

import styles from '../LaunchModal.module.scss'
import type { LaunchPartProps } from '../LaunchModal.types'
import { askedInputs } from '../LaunchModal.utils'

/**
 * Вопросы сценария - по полю на вопрос. Поля многострочные: ответ - часто задача целиком или
 * вставленное сообщение, а флага «в одну строку» у вопроса нет. Открываются пустыми: ответ
 * прошлого прогона в поле читался бы как свой, и работа ушла бы на прошлую задачу.
 */
export const InputFields = ({ form }: LaunchPartProps) => {
  const { t } = useTranslation()

  if (!form.scenario) return null

  return (
    <div className={styles.fields}>
      {askedInputs(form.scenario).map((input, index) => {
        const label = input.label || input.name

        return (
          <TextArea
            key={input.id}
            label={input.required ? t('scenarios.launch.required', { label }) : label}
            value={form.values[input.name] ?? ''}
            placeholder={input.placeholder}
            aria-required={input.required}
            data-autofocus={index === 0 ? true : undefined}
            onChange={(value) => form.setValue(input.name, value)}
          />
        )
      })}
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Section } from '@agentic-workstation/ui/Section'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import styles from './ScenarioInputs.module.scss'

/**
 * Вопросы сценария перед стартом - сейчас или в назначенный час: ответы уходят в прогон как
 * есть. Без вопросов - ничего: раздела «Questions» без полей нет.
 */
export const ScenarioInputs = ({
  scenario,
  values,
  onChange,
}: {
  scenario: ShelfScenarioWire
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}) => {
  const { t } = useTranslation()

  if (scenario.inputs.length === 0) return null

  return (
    <Section size="sm" title={t('start.questions')}>
      <div className={styles.fields}>
        {scenario.inputs.map((input) => (
          <TextArea
            key={input.id}
            label={
              input.required
                ? t('start.required', { label: input.label || input.name })
                : input.label || input.name
            }
            placeholder={input.placeholder}
            value={values[input.id] ?? ''}
            onChange={(value) => onChange({ ...values, [input.id]: value })}
          />
        ))}
      </div>
    </Section>
  )
}

import { useTranslation } from 'react-i18next'

import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Section } from '@agentic-workstation/ui/Section'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import type { useStartScenario } from '../StartScenarioScreen.hooks'
import styles from '../StartScenarioScreen.module.scss'

/** Вопросы сценария перед стартом - ответы уходят в прогон как есть. */
export const ScenarioInputs = ({
  scenario,
  start,
}: {
  scenario: ShelfScenarioWire
  start: ReturnType<typeof useStartScenario>
}) => {
  const { t } = useTranslation()
  const { form, update } = start

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
            value={form.inputs[input.id] ?? ''}
            onChange={(value) => update({ inputs: { ...form.inputs, [input.id]: value } })}
          />
        ))}
      </div>
    </Section>
  )
}

import { useTranslation } from 'react-i18next'

import type { ScenarioWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'
import { Section } from '@agentic-workstation/ui/Section'

import styles from './ScenarioView.module.scss'
import { stageRepeat } from './ScenarioView.utils'
import { CardItem } from './parts/CardItem'
import { HeadSection } from './parts/HeadSection'

/**
 * Сценарий на чтение - сохранённый с полки или черновик, который только что написала модель:
 * вопросы перед стартом, голова, этапы с карточками. Правят его в IDE или новым черновиком:
 * редактора на телефоне нет.
 */
export const ScenarioView = ({ scenario }: { scenario: ScenarioWire }) => {
  const { t } = useTranslation()

  return (
    <>
      {scenario.inputs.length > 0 && (
        <Section size="sm" title={t('start.questions')} count={scenario.inputs.length}>
          <ul className={styles.inputs}>
            {scenario.inputs.map((input) => (
              <li key={input.id} className={styles.input}>
                <span className={styles.inputLabel}>
                  {input.required
                    ? t('start.required', { label: input.label || input.name })
                    : input.label || input.name}
                </span>
                {input.placeholder && <span className={styles.muted}>{input.placeholder}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <HeadSection head={scenario.head} />
      {scenario.stages.map((stage, index) => (
        <Section
          key={stage.id}
          size="sm"
          title={stage.title || t('scenario.stage.untitled', { number: index + 1 })}
          count={stage.cards.length}
          description={stageRepeat(t, stage) || undefined}>
          <div className={styles.cards}>
            {stage.cards.map((card) => (
              <CardItem key={card.id} card={card} />
            ))}
          </div>
        </Section>
      ))}
    </>
  )
}

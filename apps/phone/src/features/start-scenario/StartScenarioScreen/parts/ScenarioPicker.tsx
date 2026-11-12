import { useTranslation } from 'react-i18next'

import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Section } from '@agentic-workstation/ui/Section'

import type { useStartScenario } from '../StartScenarioScreen.hooks'
import styles from '../StartScenarioScreen.module.scss'
import { scenarioKey } from '../../../../lib/scenarios.utils'
import { OptionList } from '../../../../shell/OptionList/OptionList'

const SCOPES = ['project', 'user'] as const

/** Сценарии полками: проекта и личные - как в окне сценариев IDE. */
export const ScenarioPicker = ({
  scenarios,
  start,
}: {
  scenarios: ShelfScenarioWire[]
  start: ReturnType<typeof useStartScenario>
}) => {
  const { t } = useTranslation()

  if (scenarios.length === 0) return <p className={styles.note}>{t('start.noScenarios')}</p>

  return (
    <>
      {SCOPES.map((scope) => {
        const shelf = scenarios.filter((scenario) => scenario.scope === scope)

        if (shelf.length === 0) return null

        return (
          <Section key={scope} size="sm" title={t(`start.shelf.${scope}`)} count={shelf.length}>
            <OptionList
              label={t(`start.shelf.${scope}`)}
              options={shelf.map((scenario) => ({
                value: scenarioKey(scenario),
                label: scenario.name,
              }))}
              isSelected={(value) => value === start.form.scenario}
              onSelect={(value) => start.update({ scenario: value })}
            />
          </Section>
        )
      })}
    </>
  )
}

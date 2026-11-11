import { useTranslation } from 'react-i18next'

import { isRunnable } from '@shared/scenario-rules'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'

import type { ScenarioOptionsProps } from '../LaunchModal.types'

/** Сценарии одной полки в списке выбора; пустая полка не рисуется. */
export const ScenarioOptions = ({ title, scenarios, form }: ScenarioOptionsProps) => {
  const { t } = useTranslation()

  if (scenarios.length === 0) return null

  return (
    <MenuSection title={title}>
      {scenarios.map((scenario) => {
        const isBroken = !isRunnable(scenario)
        const isChosen = form.scenario?.id === scenario.id && form.scenario.scope === scenario.scope

        return (
          <MenuItem
            key={`${scenario.scope}:${scenario.id}`}
            label={scenario.name}
            description={isBroken ? t('scenarios.launch.broken') : undefined}
            wrapDescription
            selection="single"
            checked={isChosen}
            disabled={isBroken}
            onSelect={() => form.choose(scenario)}
          />
        )
      })}
    </MenuSection>
  )
}

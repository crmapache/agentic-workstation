import { useTranslation } from 'react-i18next'

import { isRunnable } from '@shared/scenario-rules'
import { defaultInputValue } from '@shared/tracker-text'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import styles from '../CardModal.module.scss'
import type { ScenarioFieldsProps } from '../CardModal.types'
import { inputsOf, bindScenario } from '../CardModal.utils'
import { ProviderField } from './ProviderField'

/**
 * Сценарий карточки: какой и чем заполнить его поля. Подстановки `{{card}}` и другие
 * раскрываются при отправке - справка за «?».
 */
export const ScenarioFields = ({ form, scenarios }: ScenarioFieldsProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const binding = form.scenario
  const chosen =
    scenarios.find((one) => one.id === binding?.scenarioId && one.scope === binding.scope) ?? null
  const shelves = [
    {
      title: t('tracker.cardModal.inProject'),
      list: scenarios.filter((one) => one.scope === 'project'),
    },
    {
      title: t('tracker.cardModal.inEvery'),
      list: scenarios.filter((one) => one.scope === 'user'),
    },
  ]

  const handlePick = (scenario: (typeof scenarios)[number] | null) => {
    popover.close()
    form.set('scenario', scenario ? bindScenario(scenario, binding) : null)
    // Без сценария запускать в срок нечего: отвязка выключает и запуск, как у главного процесса.
    if (!scenario) form.set('autoRun', false)
  }

  return (
    <div className={styles.scenario}>
      <div className={styles.row}>
        <div className={styles.grow}>
          <SelectField
            {...popover.triggerProps}
            label={t('tracker.cardModal.scenario')}
            value={chosen?.name ?? binding?.scenarioId ?? t('tracker.cardModal.noScenario')}
          />
          <Popover {...popover.popoverProps} width="field">
            {popover.isOpen && (
              <Menu label={t('tracker.cardModal.scenario')} autoFocus>
                <MenuItem
                  label={t('tracker.cardModal.noScenario')}
                  selection="single"
                  checked={!binding}
                  onSelect={() => handlePick(null)}
                />
                {shelves.map(
                  (shelf) =>
                    shelf.list.length > 0 && (
                      <MenuSection key={shelf.title} title={shelf.title}>
                        {shelf.list.map((scenario) => (
                          <MenuItem
                            key={`${scenario.scope}:${scenario.id}`}
                            label={scenario.name}
                            selection="single"
                            checked={scenario === chosen}
                            disabled={!isRunnable(scenario)}
                            onSelect={() => handlePick(scenario)}
                          />
                        ))}
                      </MenuSection>
                    ),
                )}
              </Menu>
            )}
          </Popover>
        </div>
        {binding && <ProviderField form={form} scenario={chosen} />}
      </div>
      {binding &&
        inputsOf(chosen).map((input, index) => (
          <TextArea
            key={input.id}
            label={input.label || input.name}
            placeholder={input.placeholder}
            value={binding.inputs[input.name] ?? defaultInputValue(index)}
            onChange={(value) =>
              form.set('scenario', {
                ...binding,
                inputs: { ...binding.inputs, [input.name]: value },
              })
            }
          />
        ))}
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import { isProviderId } from '@shared/providers'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import styles from '../LaunchModal.module.scss'
import type { LaunchPartProps } from '../LaunchModal.types'
import { ScenarioAlert } from '../../ScenarioAlert/ScenarioAlert'
import { providerChoices, providerRefusal } from '../../../../lib/provider-choices'

/**
 * Кто исполняет сценарий - провайдер ИИ, у каждого элемента очереди свой. Варианты - общим
 * правилом окна (provider-choices): кого нет на машине и кто работает только в своём чате
 * (Antigravity, ADR 0094), выбрать нельзя, а если таким вышел выбор по умолчанию - под кнопкой
 * сказано почему.
 */
export const ProviderPicker = ({ form }: LaunchPartProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const { provider } = form
  const refusal = provider && providerRefusal(provider, t)

  const handlePick = (value: string) => {
    if (isProviderId(value)) form.setProviderId(value)
  }

  return (
    <div className={styles.group}>
      <SelectField
        {...popover.triggerProps}
        label={t('scenarios.launch.provider')}
        value={provider?.label ?? null}
        disabled={form.providers.length === 0}
      />
      <Popover {...popover.popoverProps} width="field">
        {popover.isOpen && (
          <Menu label={t('scenarios.launch.provider')} autoFocus>
            {providerChoices(form.providers, t).map((one) => (
              <MenuItem
                key={one.value}
                label={one.label}
                description={one.description}
                wrapDescription
                selection="single"
                checked={one.value === provider?.id}
                disabled={one.disabled}
                onSelect={() => handlePick(one.value)}
              />
            ))}
          </Menu>
        )}
      </Popover>
      {refusal && <ScenarioAlert tone="danger">{refusal}</ScenarioAlert>}
    </div>
  )
}

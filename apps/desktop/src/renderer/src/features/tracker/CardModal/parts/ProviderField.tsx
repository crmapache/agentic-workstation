import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import styles from '../CardModal.module.scss'
import type { ProviderFieldProps } from '../CardModal.types'
import { providerChoices } from '../../../../lib/provider-choices'
import { useProviders } from '../../../../state/providers.queries'

/**
 * Кто исполняет сценарий карточки: по умолчанию - тот, кого выбрал сам сценарий. Кого нет на
 * машине и кто работает только в своём чате, выбрать нельзя - общим правилом окна.
 */
export const ProviderField = ({ form, scenario }: ProviderFieldProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const { data: providers = [] } = useProviders()
  const binding = form.scenario
  const choices = providerChoices(providers, t)
  const headProvider = scenario?.head.provider ?? ''
  const headLabel = choices.find((one) => one.value === headProvider)?.label ?? headProvider
  const fallback = t('tracker.cardModal.providerDefault', { name: headLabel })
  const value = binding?.provider
    ? (choices.find((one) => one.value === binding.provider)?.label ?? binding.provider)
    : fallback

  const handlePick = (provider: string | null) => {
    popover.close()
    if (binding) form.set('scenario', { ...binding, provider })
  }

  return (
    <div className={styles.grow}>
      <SelectField
        {...popover.triggerProps}
        label={t('tracker.cardModal.provider')}
        value={value}
      />
      <Popover {...popover.popoverProps} width="field">
        {popover.isOpen && (
          <Menu label={t('tracker.cardModal.provider')} autoFocus>
            <MenuItem
              label={fallback}
              selection="single"
              checked={!binding?.provider}
              onSelect={() => handlePick(null)}
            />
            {choices.map((one) => (
              <MenuItem
                key={one.value}
                label={one.label}
                description={one.description}
                wrapDescription
                selection="single"
                checked={one.value === binding?.provider}
                disabled={one.disabled}
                onSelect={() => handlePick(one.value)}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </div>
  )
}

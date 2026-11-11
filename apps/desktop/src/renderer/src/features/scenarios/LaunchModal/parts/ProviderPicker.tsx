import { useTranslation } from 'react-i18next'

import type { ProviderInfo } from '@shared/providers'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import styles from '../LaunchModal.module.scss'
import type { LaunchPartProps } from '../LaunchModal.types'
import { ScenarioAlert } from '../../ScenarioAlert/ScenarioAlert'

/**
 * Кто исполняет сценарий - провайдер ИИ. Сейчас он один (Claude Code), но выбор уже здесь: у
 * каждого элемента очереди свой провайдер. Того, кого нет на машине, выбрать нельзя - и под
 * кнопкой сказано почему, если другого нет.
 */
export const ProviderPicker = ({ form }: LaunchPartProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const { provider } = form

  const reason = (one: ProviderInfo): string | undefined =>
    one.available ? undefined : t(`scenarios.launch.unavailable.${one.unavailable ?? 'noCli'}`)

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
            {form.providers.map((one) => (
              <MenuItem
                key={one.id}
                label={one.label}
                description={reason(one)}
                wrapDescription
                selection="single"
                checked={one.id === provider?.id}
                disabled={!one.available}
                onSelect={() => form.setProviderId(one.id)}
              />
            ))}
          </Menu>
        )}
      </Popover>
      {provider && !provider.available && (
        <ScenarioAlert tone="danger">{reason(provider) ?? ''}</ScenarioAlert>
      )}
    </div>
  )
}

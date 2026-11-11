import { useTranslation } from 'react-i18next'

import type { ProviderInfo } from '@shared/providers'

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import styles from '../LaunchModal.module.scss'
import type { LaunchPartProps } from '../LaunchModal.types'
import { LaunchNote } from './LaunchNote'

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
    <>
      <div className={styles.picker}>
        <DropdownButton
          {...popover.triggerProps}
          label={provider?.label ?? t('scenarios.launch.provider')}
          menuLabel={t('scenarios.launch.provider')}
          disabled={form.providers.length === 0}
        />
      </div>
      <Popover {...popover.popoverProps}>
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
        <LaunchNote tone="danger">{reason(provider) ?? ''}</LaunchNote>
      )}
    </>
  )
}

import { useTranslation } from 'react-i18next'

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import styles from '../ScheduleModal.module.scss'
import type { ProviderPickerProps } from '../ScheduleModal.types'

/**
 * Кто исполнит час: провайдер ИИ хранится в записи расписания, как и у элемента очереди. Сейчас
 * он один - Claude Code; тот, что не на месте, виден погашенным со словами почему, а не пропадает.
 */
export const ProviderPicker = ({ providers, value, onPick }: ProviderPickerProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const label = t('scenarios.schedule.form.provider')
  const chosen = providers.find((one) => one.id === value)

  return (
    <div className={styles.providerRow}>
      <span className={styles.caption}>{label}</span>
      <DropdownButton
        {...popover.triggerProps}
        size="sm"
        label={chosen?.label ?? value}
        menuLabel={label}
      />
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={label} autoFocus>
            {providers.map((provider) => (
              <MenuItem
                key={provider.id}
                label={provider.label}
                description={
                  provider.available ? undefined : t('scenarios.schedule.form.unavailable')
                }
                disabled={!provider.available}
                current={provider.id === value}
                onSelect={() => {
                  popover.close()
                  onPick(provider.id)
                }}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </div>
  )
}

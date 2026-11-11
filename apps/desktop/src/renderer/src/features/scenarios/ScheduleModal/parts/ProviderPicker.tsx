import { useTranslation } from 'react-i18next'

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { Section } from '@agentic-workstation/ui/Section'

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
    <Section size="sm" title={label}>
      <div className={styles.picker}>
        <DropdownButton
          {...popover.triggerProps}
          label={chosen?.label ?? value}
          menuLabel={label}
        />
      </div>
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
                selection="single"
                checked={provider.id === value}
                onSelect={() => {
                  popover.close()
                  onPick(provider.id)
                }}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </Section>
  )
}

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import type { PickRowProps } from '../SettingsDialog.types'
import { SettingRow } from './SettingRow'

/** Строка настройки с выбором из списка: подпись слева, кнопка выбора с меню справа. */
export const PickRow = ({ label, description, value, options, onPick }: PickRowProps) => {
  const popover = usePopover()
  const chosen = options.find((option) => option.value === value)

  const handlePick = (picked: string) => {
    popover.close()
    onPick(picked)
  }

  return (
    <SettingRow label={label} description={description}>
      <DropdownButton
        {...popover.triggerProps}
        size="sm"
        label={chosen?.label ?? value}
        menuLabel={label}
      />
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={label} autoFocus>
            {options.map((option) => (
              <MenuItem
                key={option.value}
                label={option.label}
                description={option.description}
                disabled={option.disabled}
                selection="single"
                checked={option.value === value}
                onSelect={() => handlePick(option.value)}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </SettingRow>
  )
}

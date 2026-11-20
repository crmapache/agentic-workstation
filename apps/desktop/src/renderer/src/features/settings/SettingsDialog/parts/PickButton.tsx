import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import type { PickButtonProps } from '../SettingsDialog.types'

/** Выбор из списка в строке настройки: тихая кнопка с выбранным и меню вариантов под ней. */
export const PickButton = ({ label, value, options, onPick }: PickButtonProps) => {
  const popover = usePopover()
  const chosen = options.find((option) => option.value === value)

  const handlePick = (picked: string) => {
    popover.close()
    onPick(picked)
  }

  return (
    <>
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
    </>
  )
}

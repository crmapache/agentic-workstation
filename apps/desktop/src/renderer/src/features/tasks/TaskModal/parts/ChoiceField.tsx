import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import type { ChoiceFieldProps } from '../TaskModal.types'

/** Поле выбора формы задания: SelectField и список вариантов шириной с поле. */
export const ChoiceField = ({ label, value, choices, onPick }: ChoiceFieldProps) => {
  const popover = usePopover()
  const chosen = choices.find((choice) => choice.value === value)

  const handlePick = (picked: string) => {
    popover.close()
    onPick(picked)
  }

  return (
    <>
      <SelectField {...popover.triggerProps} label={label} value={chosen?.label ?? value} />
      <Popover {...popover.popoverProps} width="field">
        {popover.isOpen && (
          <Menu label={label} autoFocus>
            {choices.map((choice) => (
              <MenuItem
                key={choice.value}
                label={choice.label}
                description={choice.description}
                selection="single"
                checked={choice.value === value}
                onSelect={() => handlePick(choice.value)}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </>
  )
}

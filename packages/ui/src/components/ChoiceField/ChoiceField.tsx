import { Menu } from '../Menu/Menu'
import { MenuItem } from '../MenuItem/MenuItem'
import { Popover } from '../Popover/Popover'
import { usePopover } from '../Popover/Popover.hooks'
import { SelectField } from '../SelectField/SelectField'
import type { ChoiceFieldProps } from './ChoiceField.types'

/**
 * Выбор из списка в форме: SelectField с подписью выбранного, по нажатию - меню вариантов
 * шириной с поле. У варианта может быть пояснение (что это) и погашенность (нельзя сейчас:
 * не установлен, нет доступа) - пункт виден, но не выбирается. Значение, которого нет в
 * списке, стоит в поле как есть: открыть форму не должно молча менять выбранное.
 */
export const ChoiceField = ({ label, value, options, onPick }: ChoiceFieldProps) => {
  const popover = usePopover()
  const chosen = options.find((option) => option.value === value)

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

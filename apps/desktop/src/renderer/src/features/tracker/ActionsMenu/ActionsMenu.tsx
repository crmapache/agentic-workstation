import type { MouseEvent } from 'react'
import { Ellipsis } from 'lucide-react'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import type { ActionsMenuProps } from './ActionsMenu.types'

/**
 * Кнопка «⋯» с меню действий карточки, группы или потока. Ни нажатие, ни клик по ней и по её
 * пунктам не доходят до того, на чём она стоит: карточка не начинает перетаскивание и не
 * открывает своё окно поверх выбранного действия.
 */
export const ActionsMenu = ({ label, items }: ActionsMenuProps) => {
  const popover = usePopover()

  const handleStop = (event: MouseEvent) => event.stopPropagation()

  return (
    <span onMouseDown={handleStop} onClick={handleStop}>
      <IconButton {...popover.triggerProps} icon={Ellipsis} label={label} size="xs" />
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={label} autoFocus>
            {items.map((item) => (
              <MenuItem
                key={item.key}
                icon={item.icon}
                label={item.label}
                iconTone={item.danger ? 'danger' : undefined}
                disabled={item.disabled}
                onSelect={() => {
                  popover.close()
                  item.onSelect()
                }}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </span>
  )
}

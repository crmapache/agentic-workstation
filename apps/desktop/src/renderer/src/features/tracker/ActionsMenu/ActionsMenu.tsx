import type { MouseEvent } from 'react'
import { Ellipsis } from 'lucide-react'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuSubmenu } from '@agentic-workstation/ui/MenuSubmenu'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import type { ActionsMenuProps } from './ActionsMenu.types'
import { ActionLeafItem } from './parts/ActionLeafItem'

/**
 * Кнопка «⋯» с меню действий карточки, группы или потока; пункт с вариантами открывает меню
 * сбоку. Ни нажатие, ни клик по ней и по её пунктам не доходят до того, на чём она стоит:
 * карточка не начинает перетаскивание и не открывает своё окно поверх выбранного действия.
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
            {items.map((item) =>
              'items' in item ? (
                <MenuSubmenu
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  menuLabel={item.menuLabel}
                  disabled={item.disabled || item.items.length === 0}>
                  {item.items.map((leaf) => (
                    <ActionLeafItem key={leaf.key} item={leaf} onClose={popover.close} />
                  ))}
                </MenuSubmenu>
              ) : (
                <ActionLeafItem key={item.key} item={item} onClose={popover.close} />
              ),
            )}
          </Menu>
        )}
      </Popover>
    </span>
  )
}

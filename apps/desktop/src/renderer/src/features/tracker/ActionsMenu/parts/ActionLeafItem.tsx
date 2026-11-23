import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import type { ActionLeafItemProps } from '../ActionsMenu.types'

/** Пункт меню действий: выбор закрывает меню (и меню сбоку с ним) и делает действие. */
export const ActionLeafItem = ({ item, onClose }: ActionLeafItemProps) => (
  <MenuItem
    icon={item.icon}
    label={item.label}
    description={item.description}
    iconTone={item.danger ? 'danger' : undefined}
    disabled={item.disabled}
    onSelect={() => {
      onClose()
      item.onSelect()
    }}
  />
)

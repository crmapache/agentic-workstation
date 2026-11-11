import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import { MENU_GROUPS, COMMAND_LOOK } from '../FileTreeView.constants'
import type { TreeMenuProps } from '../FileTreeView.types'
import { allows } from '../FileTreeView.utils'

/**
 * Меню правой кнопки в дереве, как в WebStorm: у папки - создать файл и папку, у всех -
 * вырезать, копировать, вставить (в папку, а у файла - рядом с ним), полный путь,
 * переименовать и в корзину. У пустого места - корень проекта: создать, вставить, путь.
 * Пустые группы не рисуются, линии стоят только между непустыми.
 */
export const TreeMenu = ({ target, canPaste, onCommand, onClose }: TreeMenuProps) => {
  const { t } = useTranslation()
  const { id, ref, onToggle } = useAnchoredPopover(target?.anchor ?? null, onClose)
  const groups = target
    ? MENU_GROUPS.map((group) => group.filter((command) => allows(command, target.item))).filter(
        (group) => group.length > 0,
      )
    : []

  return (
    <Popover id={id} ref={ref} onToggle={onToggle}>
      {target && (
        <Menu label={t('fileTree.menu.label')} autoFocus>
          {groups.map((group, index) => (
            <Fragment key={group[0]}>
              {index > 0 && <MenuSeparator />}
              {group.map((command) => (
                <MenuItem
                  key={command}
                  icon={COMMAND_LOOK[command].icon}
                  label={t(`fileTree.menu.${command === 'trash' ? 'delete' : command}`)}
                  hint={COMMAND_LOOK[command].keys}
                  disabled={command === 'paste' && !canPaste}
                  onSelect={() => onCommand(command, target.item)}
                />
              ))}
            </Fragment>
          ))}
        </Menu>
      )}
    </Popover>
  )
}

import { X, Copy, ListX, SquareX, ArrowRightToLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import type { TabMenuProps } from '../EditorTabs.types'
import { requestCloseTabs } from '../../editor-close'
import { tabTarget } from '../../../../state/editor-tabs.utils'

/**
 * Меню правой кнопки на вкладке файла или разницы, как в WebStorm: закрыть эту, остальные,
 * все справа или все сразу; скопировать путь файла от корня проекта. Встаёт под вкладкой.
 */
export const TabMenu = ({ projectId, keys, target, onClose }: TabMenuProps) => {
  const { t } = useTranslation()
  const { id, ref, onToggle } = useAnchoredPopover(target?.anchor ?? null, onClose)
  const key = target?.key ?? ''
  const index = keys.indexOf(key)

  const close = (closing: readonly string[]) => {
    ref.current?.hidePopover()
    if (closing.length > 0) requestCloseTabs(projectId, closing)
  }

  const handleClose = () => close([key])

  const handleCloseOthers = () => close(keys.filter((open) => open !== key))

  const handleCloseRight = () => close(keys.slice(index + 1))

  const handleCloseAll = () => close(keys)

  const handleCopy = () => {
    ref.current?.hidePopover()
    void navigator.clipboard.writeText(tabTarget(key).path)
  }

  return (
    <Popover id={id} ref={ref} onToggle={onToggle}>
      {target && (
        <Menu label={t('editor.tabs.menu.label')} autoFocus>
          <MenuItem icon={X} label={t('editor.tabs.menu.close')} onSelect={handleClose} />
          <MenuItem
            icon={SquareX}
            label={t('editor.tabs.menu.closeOthers')}
            onSelect={handleCloseOthers}
          />
          <MenuItem
            icon={ArrowRightToLine}
            label={t('editor.tabs.menu.closeRight')}
            onSelect={handleCloseRight}
          />
          <MenuItem icon={ListX} label={t('editor.tabs.menu.closeAll')} onSelect={handleCloseAll} />
          <MenuSeparator />
          <MenuItem icon={Copy} label={t('editor.tabs.menu.copyPath')} onSelect={handleCopy} />
        </Menu>
      )}
    </Popover>
  )
}

import { X, Copy, ListX, History, SquareX, ArrowRightToLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import type { TabMenuProps } from '../EditorTabs.types'
import { requestCloseTabs } from '../../editor-close'
import { isOutsidePath } from '../../../../lib/path.utils'
import { tabTarget } from '../../../../state/editor-tabs.utils'
import { useSelectionStore } from '../../../../state/selection.store'

/**
 * Меню правой кнопки на вкладке, как в WebStorm: закрыть эту, остальные, все справа или все
 * сразу; скопировать путь от корня проекта; у файла проекта - его локальная история. Встаёт
 * под вкладкой.
 */
export const TabMenu = ({ projectId, keys, target, onClose }: TabMenuProps) => {
  const { t } = useTranslation()
  const { id, ref, onToggle } = useAnchoredPopover(target?.anchor ?? null, onClose)
  const openHistory = useSelectionStore((state) => state.openHistory)
  const key = target?.key ?? ''
  const index = keys.indexOf(key)
  const { kind, path } = tabTarget(key)
  // История - у файлов проекта; у самой вкладки истории она уже открыта.
  const hasHistory = kind !== 'history' && !isOutsidePath(path)

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
    void navigator.clipboard.writeText(path)
  }

  const handleHistory = () => {
    ref.current?.hidePopover()
    openHistory(projectId, path)
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
          {hasHistory && (
            <MenuItem
              icon={History}
              label={t('editor.tabs.menu.history')}
              onSelect={handleHistory}
            />
          )}
        </Menu>
      )}
    </Popover>
  )
}

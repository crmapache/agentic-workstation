import { Copy, FileCode, GitCompareArrows } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import type { ChangeMenuProps } from '../ChangesView.types'
import { useSelectionStore } from '../../../../state/selection.store'

/**
 * Меню правой кнопки на изменённом файле: разница, сам файл (у удалённого его нет), путь от
 * корня проекта. Встаёт под строкой.
 */
export const ChangeMenu = ({ projectId, target, onClose }: ChangeMenuProps) => {
  const { t } = useTranslation()
  const { id, ref, onToggle } = useAnchoredPopover(target?.anchor ?? null, onClose)
  const openDiff = useSelectionStore((state) => state.openDiff)
  const selectFile = useSelectionStore((state) => state.selectFile)
  const path = target?.change.path ?? ''

  const run = (action: () => void) => {
    ref.current?.hidePopover()
    action()
  }

  const handleShowDiff = () => run(() => openDiff(projectId, path))

  const handleOpenFile = () => run(() => selectFile(projectId, path))

  const handleCopy = () => run(() => void navigator.clipboard.writeText(path))

  return (
    <Popover id={id} ref={ref} onToggle={onToggle}>
      {target && (
        <Menu label={t('changes.menu.label')} autoFocus>
          <MenuItem
            icon={GitCompareArrows}
            label={t('changes.menu.showDiff')}
            onSelect={handleShowDiff}
          />
          <MenuItem
            icon={FileCode}
            label={t('changes.menu.openFile')}
            hint="F4"
            disabled={target.change.kind === 'deleted'}
            onSelect={handleOpenFile}
          />
          <MenuSeparator />
          <MenuItem icon={Copy} label={t('changes.menu.copyPath')} onSelect={handleCopy} />
        </Menu>
      )}
    </Popover>
  )
}

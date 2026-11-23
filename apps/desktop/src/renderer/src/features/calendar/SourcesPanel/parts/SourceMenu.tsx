import { X, Pencil, Trash2, Ellipsis, RefreshCw, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import type { SourceRowProps } from '../SourcesPanel.types'
import { useCalendarActions } from '../../calendar.actions'
import { useCalendarStore } from '../../calendar.store'

/** «⋯» источника: прочитать сейчас или остановить, править, учитывать в накладках, удалить. */
export const SourceMenu = ({ source }: Pick<SourceRowProps, 'source'>) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const edit = useCalendarStore((store) => store.edit)
  const { sync, cancel, patch, remove } = useCalendarActions()
  const label = t('calendar.sources.menu', { name: source.name })
  const busy = source.sync.phase !== 'idle'

  const handle = (action: () => unknown) => () => {
    popover.close()
    void action()
  }

  return (
    <>
      <IconButton {...popover.triggerProps} icon={Ellipsis} label={label} size="xs" />
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={label} autoFocus>
            {busy ? (
              <MenuItem
                icon={X}
                label={t('calendar.sources.stop')}
                onSelect={handle(() => cancel(source.id))}
              />
            ) : (
              <MenuItem
                icon={RefreshCw}
                label={t('calendar.sources.sync')}
                onSelect={handle(() => sync(source.id))}
              />
            )}
            <MenuItem
              icon={Pencil}
              label={t('calendar.sources.edit')}
              onSelect={handle(() => edit(source.id))}
            />
            <MenuItem
              icon={TriangleAlert}
              label={t('calendar.sources.countOverlaps')}
              selection="multiple"
              checked={source.inOverlaps}
              onSelect={handle(() => patch(source.id, { inOverlaps: !source.inOverlaps }))}
            />
            <MenuSeparator />
            <MenuItem
              icon={Trash2}
              label={t('calendar.sources.remove')}
              onSelect={handle(() => remove(source.id))}
            />
          </Menu>
        )}
      </Popover>
    </>
  )
}

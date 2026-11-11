import { useState } from 'react'

import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import type { SearchTab } from '../search-everywhere.types'
import { SearchPanel } from '../SearchPanel/SearchPanel'
import { useSearchShortcuts } from './SearchEverywhere.hooks'
import type { SearchEverywhereProps } from './SearchEverywhere.types'

/**
 * Поиск везде, как в WebStorm: панель сверху по центру окна. Кнопки нет - открывается
 * двойным Shift и сочетаниями вкладок. Панель монтируется только открытой: так каждый
 * раз свежий список файлов и пустой запрос.
 */
export const SearchEverywhere = ({ projectId, actions, onOpenFile }: SearchEverywhereProps) => {
  const popover = usePopover()
  const [tab, setTab] = useState<SearchTab>('all')

  useSearchShortcuts((next) => {
    setTab(next)
    popover.open()
  })

  return (
    <Popover {...popover.popoverProps} width="xl" placement="top">
      {popover.isOpen && (
        <SearchPanel
          projectId={projectId}
          actions={actions}
          tab={tab}
          onTabChange={setTab}
          onOpenFile={onOpenFile}
          onClose={popover.close}
        />
      )}
    </Popover>
  )
}

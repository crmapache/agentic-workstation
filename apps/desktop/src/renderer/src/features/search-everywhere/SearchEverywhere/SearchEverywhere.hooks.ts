import { useEffect, useEffectEvent } from 'react'

import { DOUBLE_SHIFT_INTERVAL_MS } from '../search-everywhere.constants'
import type { SearchTab } from '../search-everywhere.types'
import { tabForShortcut, createDoubleShiftDetector } from '../search-shortcuts.utils'
import { withMacKeys } from '../../../lib/keys'

/**
 * Сочетания поиска на всё окно: двойной Shift - «All», ⌘⇧O, ⌘⇧A, ⌘⇧F - своя вкладка.
 * Слушаются в фазе перехвата: поле ввода или дерево не должны их съесть. Поверх
 * модального диалога поиск не открывается - всё вне диалога в этот момент мёртвое.
 */
export const useSearchShortcuts = (onOpen: (tab: SearchTab) => void) => {
  const handleOpen = useEffectEvent(onOpen)

  useEffect(() => {
    const detectDoubleShift = createDoubleShiftDetector(DOUBLE_SHIFT_INTERVAL_MS)

    const handleKey = (event: KeyboardEvent) => {
      if (document.querySelector('dialog:modal')) return

      const tab = event.type === 'keydown' ? tabForShortcut(withMacKeys(event)) : null

      if (tab) {
        event.preventDefault()
        handleOpen(tab)
      } else if (detectDoubleShift(event)) {
        handleOpen('all')
      }
    }

    window.addEventListener('keydown', handleKey, true)
    window.addEventListener('keyup', handleKey, true)

    return () => {
      window.removeEventListener('keydown', handleKey, true)
      window.removeEventListener('keyup', handleKey, true)
    }
  }, [])
}

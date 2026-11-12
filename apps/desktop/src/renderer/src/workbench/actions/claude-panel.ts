import { useEffect, useEffectEvent } from 'react'

import { withMacKeys } from '../../lib/keys'
import { useLayoutStore } from '../../state/layout.store'
import { useClaudeCodeStore } from '../../features/claude-code/claude-code.store'
import { isOpenPanelKey } from '../../features/claude-code/panel-keys.utils'

/** Узел правой панели (зона 7) - его ставит SidePanel с placement="end". */
const PROVIDER_PANEL = '[data-placement="end"]'

/** Всплывающие слои: фокус в них - не «человек ушёл из панели» (поиск везде, меню, диалоги). */
const OVERLAY = 'dialog, [popover]'

/**
 * Был ли человек в правой панели перед последним действием. Фокус во всплывающем слое не
 * в счёт: «Show or Hide Claude Code», выбранное в поиске везде, судит по тому, где человек
 * работал до поиска, а не по полю самого поиска. Одно на окно - слушатель ставит useClaudePanelKey.
 */
let wasInPanel = false

const noteFocus = (event: FocusEvent) => {
  const target = event.target instanceof Element ? event.target : null

  if (!target || target.closest(OVERLAY)) return

  wasInPanel = target.closest(PROVIDER_PANEL) !== null
}

/**
 * «Открыть панель» Claude Code (Open the panel в ACC, как окно инструмента в JetBrains): панель
 * спрятана или фокус не в ней - показать её и поставить клавиатуру в поле ввода; уже в ней -
 * спрятать. Одна дверь для клавиши и для действия поиска везде.
 */
export const useClaudePanelToggle = () => {
  const selectProviderView = useLayoutStore((state) => state.selectProviderView)
  const requestFocus = useClaudeCodeStore((store) => store.requestFocus)

  return () => {
    const { provider } = useLayoutStore.getState()
    const isShown = provider.isOpen && provider.activeViewId === 'claude-code'

    // Тот же вид, что показан, selectProviderView сворачивает, иначе - показывает.
    if (isShown && wasInPanel) return selectProviderView('claude-code')
    if (!isShown) selectProviderView('claude-code')

    wasInPanel = true
    requestFocus()
  }
}

/**
 * Клавиша «открыть панель» (⌘Esc) на всё окно: в фазе перехвата и с остановкой - Esc этого
 * нажатия не должен остановить агента или закрыть окно агента. Поверх модального диалога
 * молчит: всё вне него в этот момент мёртвое. Заодно помнит, был ли человек в панели.
 */
export const useClaudePanelKey = (onToggle: () => void) => {
  const handleToggle = useEffectEvent(onToggle)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!isOpenPanelKey(withMacKeys(event)) || document.querySelector('dialog:modal')) return

      event.preventDefault()
      event.stopImmediatePropagation()
      handleToggle()
    }

    window.addEventListener('keydown', handleKey, true)
    window.addEventListener('focusin', noteFocus, true)

    return () => {
      window.removeEventListener('keydown', handleKey, true)
      window.removeEventListener('focusin', noteFocus, true)
    }
  }, [])
}

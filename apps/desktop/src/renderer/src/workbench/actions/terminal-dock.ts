import { useEffect, useEffectEvent } from 'react'

import { useLayoutStore } from '../../state/layout.store'
import { useTerminalStore } from '../../features/terminal/terminal.store'

/** Узел терминала - его ставит TerminalPanel. */
const TERMINAL_PANEL = '[data-terminal-panel]'

const isTerminalKey = (event: KeyboardEvent) =>
  event.key === 'F12' && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey

/**
 * Терминал под панелью провайдера (ADR 0037), как Terminal в WebStorm. Кнопка полосы -
 * показать с клавиатурой в оболочке или спрятать. Клавиша и поиск везде: спрятан или фокус
 * не в нём - показать и поставить клавиатуру в оболочку; уже в нём - спрятать.
 */
export const useTerminalToggle = () => {
  const setTerminalOpen = useLayoutStore((state) => state.setTerminalOpen)
  const requestFocus = useTerminalStore((store) => store.requestFocus)

  const show = () => {
    setTerminalOpen(true)
    requestFocus()
  }

  return {
    /** Кнопка полосы: открытый прячет, закрытый показывает. */
    toggle: () => (useLayoutStore.getState().terminal.isOpen ? setTerminalOpen(false) : show()),
    /** Клавиша и поиск везде: прячет, только если человек уже в терминале. */
    toggleFromKeyboard: () => {
      const isInside = document.activeElement?.closest(TERMINAL_PANEL) !== null

      if (useLayoutStore.getState().terminal.isOpen && isInside) return setTerminalOpen(false)

      show()
    },
  }
}

/**
 * ⌥F12 на всё окно, как в WebStorm: в фазе перехвата, иначе нажатие съела бы оболочка в
 * терминале. Поверх модального диалога молчит.
 */
export const useTerminalKey = (onToggle: () => void) => {
  const handleToggle = useEffectEvent(onToggle)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!isTerminalKey(event) || event.repeat || document.querySelector('dialog:modal')) return

      event.preventDefault()
      event.stopImmediatePropagation()
      handleToggle()
    }

    window.addEventListener('keydown', handleKey, true)

    return () => window.removeEventListener('keydown', handleKey, true)
  }, [])
}

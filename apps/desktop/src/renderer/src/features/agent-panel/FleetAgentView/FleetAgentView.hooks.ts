import { useEffect } from 'react'

/**
 * Escape закрывает окно - в фазе перехвата и раньше обработчиков панели, которые иначе
 * остановили бы ход (как у окна поиска в ACC).
 */
export const useEscapeToClose = (onClose: () => void) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])
}

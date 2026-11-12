import { useEffect } from 'react'

import { notePresence, flushActivity } from '../../lib/activity-log'
import { useWorkspace } from '../../state/workspace.queries'
import { isPresent, PRESENCE_MOVE_MS, PRESENCE_TICK_MS } from './presence.utils'

/**
 * Присутствие человека для статистики: минута считается, если окно в фокусе и за последние три
 * минуты был ввод - клавиши, мышь, прокрутка. Открытое, но брошенное окно минут не набирает.
 * Слушает всё окно в фазе перехвата: ввод в панели, редакторе и терминале одинаково чей-то.
 */
export const usePresence = (): void => {
  const { data } = useWorkspace()
  const projectId = data?.activeProjectId ?? null

  useEffect(() => {
    let lastInput = document.hasFocus() ? Date.now() : 0
    let lastMove = 0

    const mark = () => {
      if (isPresent(Date.now(), lastInput, document.hasFocus())) notePresence(projectId)
    }
    const handleInput = () => {
      lastInput = Date.now()
      mark()
    }
    const handleMove = () => {
      if (Date.now() - lastMove < PRESENCE_MOVE_MS) return

      lastMove = Date.now()
      handleInput()
    }
    const handleLeave = () => flushActivity()
    const tick = window.setInterval(mark, PRESENCE_TICK_MS)

    window.addEventListener('keydown', handleInput, true)
    window.addEventListener('pointerdown', handleInput, true)
    window.addEventListener('wheel', handleInput, { capture: true, passive: true })
    window.addEventListener('pointermove', handleMove, { capture: true, passive: true })
    window.addEventListener('blur', handleLeave)
    window.addEventListener('beforeunload', handleLeave)

    return () => {
      window.clearInterval(tick)
      window.removeEventListener('keydown', handleInput, true)
      window.removeEventListener('pointerdown', handleInput, true)
      window.removeEventListener('wheel', handleInput, true)
      window.removeEventListener('pointermove', handleMove, true)
      window.removeEventListener('blur', handleLeave)
      window.removeEventListener('beforeunload', handleLeave)
    }
  }, [projectId])
}

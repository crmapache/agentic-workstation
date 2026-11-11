import { useEffect } from 'react'

import { notePresence, flushActivity } from '../../lib/activity-log'
import { useWorkspace } from '../../state/workspace.queries'

/** Сколько после последнего ввода человек ещё считается в окне: читает код, смотрит ленту. */
const IDLE_MS = 3 * 60_000
/** Как часто отмечать минуту, пока человек тут без ввода. */
const TICK_MS = 15_000
/** Движение мыши - не чаще раза в секунду: событий бывает по сотне в секунду. */
const MOVE_MS = 1_000

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
      if (document.hasFocus() && Date.now() - lastInput <= IDLE_MS) notePresence(projectId)
    }
    const handleInput = () => {
      lastInput = Date.now()
      mark()
    }
    const handleMove = () => {
      if (Date.now() - lastMove < MOVE_MS) return

      lastMove = Date.now()
      handleInput()
    }
    const handleLeave = () => flushActivity()
    const tick = window.setInterval(mark, TICK_MS)

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

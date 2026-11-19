import { useState, useEffect } from 'react'

import { GROUP_COLLAPSE_DELAY_MS } from './ToolGroup.constants'

/**
 * Свёрнута ли шапка группы в «N tools»: пока пачка идёт - нет (видно текущий вызов),
 * кончилась - через GROUP_COLLAPSE_DELAY_MS, если за это время не пришёл следующий.
 */
export const useGroupCollapsed = (isRunning: boolean) => {
  const [isSettled, setIsSettled] = useState(!isRunning)

  // Пачка снова пошла - счёт «улеглась» начнётся заново после её конца.
  if (isRunning && isSettled) setIsSettled(false)

  useEffect(() => {
    if (isRunning) return

    const timer = window.setTimeout(() => setIsSettled(true), GROUP_COLLAPSE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [isRunning])

  return !isRunning && isSettled
}

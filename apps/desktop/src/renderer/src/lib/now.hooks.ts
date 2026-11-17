import { useState, useEffect } from 'react'

/**
 * Текущее время, обновляется раз в interval, пока active: «in 3h» расписания сценариев и
 * заданий, «Today 09:00» уведомлений, часы ожидания черновика. Неактивные часы не тикают - вид
 * без сроков не перерисовывается зря.
 */
export const useNow = (active: boolean, interval: number): number => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return

    const tick = () => setNow(Date.now())
    // Первое обновление сразу: часы не должны показывать время, когда их остановили.
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, interval)

    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [active, interval])

  return now
}

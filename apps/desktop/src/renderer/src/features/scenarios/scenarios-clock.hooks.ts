import { useState, useEffect } from 'react'

/**
 * Текущее время вида сценариев, обновляется раз в interval, пока active: «in 3h» расписания,
 * часы ожидания черновика, ближайший срок формы. Неактивные часы не тикают - вид без сроков не
 * перерисовывается зря. (Как clock.hooks панели Claude Code: соседнюю фичу брать нельзя.)
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

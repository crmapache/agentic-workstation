import { useState, useEffect } from 'react'

/** Текущее время, обновляется раз в interval, пока active: часы хода, время до сброса лимита. */
export const useNow = (active: boolean, interval: number) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return

    const tick = () => setNow(Date.now())
    // Первое обновление сразу: часы не должны показывать время прошлого хода.
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, interval)

    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [active, interval])

  return now
}

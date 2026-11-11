import { useState, useEffect } from 'react'

/** Часы для «с какого времени»: перерисовка раз в interval, а не на каждую секунду. */
export const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)

    return () => clearInterval(timer)
  }, [intervalMs])

  return now
}

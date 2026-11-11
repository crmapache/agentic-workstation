import { useState, useEffect } from 'react'

/** Текущее время раз в interval - для отсчёта кода пары, пока он на экране. */
export const useNow = (interval: number): number => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval)

    return () => window.clearInterval(timer)
  }, [interval])

  return now
}

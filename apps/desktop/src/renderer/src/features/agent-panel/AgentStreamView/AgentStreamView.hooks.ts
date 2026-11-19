import { useRef, useLayoutEffect } from 'react'

/**
 * Журнал живого агента держится у низа, как лента: смотреть агента в работе не значит
 * листать вниз руками на каждом шаге. growth - что меняется с каждым шагом.
 */
export const useStickToEnd = (growth: unknown) => {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = ref.current

    if (element) element.scrollTop = element.scrollHeight
  }, [growth])

  return ref
}

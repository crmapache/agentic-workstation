import { useRef, useMemo, useState, useEffect } from 'react'

import type { UiNode, UiEvent, UiValues } from '@shared/extension-ui'

import { invoke } from '../../../lib/ipc'
import { CHANGE_QUIET_MS } from './ExtensionSurface.constants'
import type { SurfaceApi } from './ExtensionSurface.types'
import { mergedValues, declaredValues } from './ExtensionSurface.utils'

/**
 * Поверхность вида: значения полей живут здесь, пока человек их правит, и едут расширению в
 * каждом событии. Правка поля - событие change после паузы в наборе; кнопка и строка списка -
 * action сразу, со всеми значениями формы.
 */
export const useSurfaceApi = (viewKey: string, tree: UiNode | null): SurfaceApi => {
  const declared = useMemo(() => declaredValues(tree), [tree])
  const before = useRef(declared)
  const [values, setValues] = useState<UiValues>(declared)
  const latest = useRef(values)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    setValues((current) => mergedValues(current, before.current, declared))
    before.current = declared
  }, [declared])

  useEffect(() => {
    latest.current = values
  }, [values])

  useEffect(() => {
    const pending = timers.current

    return () => pending.forEach((timer) => clearTimeout(timer))
  }, [])

  return useMemo(() => {
    const send = (event: UiEvent) => void invoke('extensions:viewEvent', { key: viewKey, event })

    return {
      values,
      setValue: (name, value) => {
        const next = { ...latest.current, [name]: value }

        latest.current = next
        setValues(next)
        clearTimeout(timers.current.get(name))
        timers.current.set(
          name,
          setTimeout(
            () => send({ kind: 'change', name, value, values: latest.current }),
            typeof value === 'boolean' ? 0 : CHANGE_QUIET_MS,
          ),
        )
      },
      act: (action) => send({ kind: 'action', action, values: latest.current }),
    }
  }, [values, viewKey])
}

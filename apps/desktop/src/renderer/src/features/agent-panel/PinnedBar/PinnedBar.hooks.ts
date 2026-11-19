import { useRef, useEffect, useLayoutEffect } from 'react'

import { usePanelState } from '../panel.queries'
import { usePinsStore } from '../pins.store'

/**
 * Высота полки для ленты: меряется, а не считается по строкам (шрифт и плотность
 * экрана свои). Пока полки нет - 0; ушла - тоже 0, запас сверху ленте больше не нужен.
 * Колбэк берётся последний: новая функция на каждую перерисовку ленты не переподключает
 * наблюдатель и не мигает нулём.
 */
export const useBarHeight = (isShown: boolean, onHeight?: (px: number) => void) => {
  const ref = useRef<HTMLDivElement>(null)
  const callback = useRef(onHeight)

  useLayoutEffect(() => {
    callback.current = onHeight
  })

  useLayoutEffect(() => {
    const bar = ref.current
    const report = (px: number) => callback.current?.(px)

    if (!isShown || !bar) {
      report(0)

      return
    }

    const observer = new ResizeObserver(() => report(bar.offsetHeight))

    report(bar.offsetHeight)
    observer.observe(bar)

    return () => {
      observer.disconnect()
      report(0)
    }
  }, [isShown])

  return ref
}

/**
 * Закрепы живут, пока жива вкладка: открытая или закрытая, но ещё возвращаемая (она
 * вернётся под тем же id). Ушедшую совсем полка не помнит.
 */
export const useForgetClosedPins = () => {
  const { data: state } = usePanelState()
  const keepOnly = usePinsStore((store) => store.keepOnly)
  const liveIds =
    state &&
    [
      ...state.conversations.map((conversation) => conversation.id),
      ...Object.values(state.closedByProject).flatMap((closed) => closed.map((tab) => tab.id)),
    ].join('\n')

  useEffect(() => {
    if (liveIds !== undefined) keepOnly(liveIds.split('\n'))
  }, [liveIds, keepOnly])
}

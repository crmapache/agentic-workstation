import { useRef, useEffect, useLayoutEffect } from 'react'

import { LOG_BOTTOM_PX } from './log-scroll.constants'

/** Ближайший предок, который прокручивается: журнал стоит в теле окна прогона и листается им. */
const scrollerOf = (node: HTMLElement | null): HTMLElement | null => {
  for (let parent = node?.parentElement ?? null; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)

    if (overflowY === 'auto' || overflowY === 'scroll') return parent
  }

  return null
}

const isAtBottom = (box: HTMLElement) =>
  box.scrollHeight - box.scrollTop - box.clientHeight <= LOG_BOTTOM_PX

/**
 * Прокрутка журнала - как разговор из истории: открывается концом и держится у конца, пока
 * строки дорисовываются (лента провайдера подгрузилась, подсветка кода, картинки) и пока идущий
 * разговор растёт; страница выше («load earlier») встаёт над читаемым, не сдвигая его. Журнал
 * листает ближайший прокручиваемый предок: журнал шага сценария, разговор ИИ о коннекторе.
 */
export const useLogScroll = (items: readonly unknown[] | undefined) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const held = useRef<{ height: number; top: number } | null>(null)

  useEffect(() => {
    const root = rootRef.current
    const box = scrollerOf(root)

    if (!root || !box) return

    const handleScroll = () => {
      stick.current = isAtBottom(box)
    }
    const observer = new ResizeObserver(() => {
      if (stick.current && !held.current) box.scrollTop = box.scrollHeight
    })

    box.addEventListener('scroll', handleScroll, { passive: true })
    observer.observe(root)

    return () => {
      box.removeEventListener('scroll', handleScroll)
      observer.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    const box = scrollerOf(rootRef.current)
    const before = held.current

    if (!box) return

    if (before) {
      box.scrollTop = before.top + (box.scrollHeight - before.height)
      held.current = null
    } else if (stick.current) {
      box.scrollTop = box.scrollHeight
    }
  }, [items])

  /** Перед просьбой о странице выше: запомнить, что читают, - она встанет над этим. */
  const holdPlace = () => {
    const box = scrollerOf(rootRef.current)

    if (box) held.current = { height: box.scrollHeight, top: box.scrollTop }
  }

  return { rootRef, holdPlace }
}

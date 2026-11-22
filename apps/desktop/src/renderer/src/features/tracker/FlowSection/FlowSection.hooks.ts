import { useRef, useState, useEffect, useLayoutEffect } from 'react'

import type { RowSize, RowStart } from './FlowSection.types'

/** Встать рядом к колонке start: её левый край - к левому краю ряда; 'end' - в конец ряда. */
const placeRow = (node: HTMLElement, start: RowStart) => {
  if (start?.kind === 'end') node.scrollLeft = node.scrollWidth
  if (start?.kind !== 'group') return

  const column = node.querySelector(`[data-group-column="${CSS.escape(start.id)}"]`)

  if (column) {
    node.scrollLeft += column.getBoundingClientRect().left - node.getBoundingClientRect().left
  }
}

/**
 * Прокрутка ряда групп. Родная полоса ряда спрятана: под рядом её двойник, прибитый к низу
 * страницы, пока низ потока ниже края (sticky), - листать можно, не доезжая до конца потока.
 * Ряд и двойник двигают друг друга. Каждый раз, когда ряд появляется на экране (открыли вид,
 * сменили проект, развернули поток), он встаёт к start; пока ряд на экране, его двигает только
 * человек.
 */
export const useRowScroll = (start: RowStart) => {
  const row = useRef<HTMLDivElement | null>(null)
  const track = useRef<HTMLDivElement | null>(null)
  const bar = useRef<HTMLDivElement | null>(null)
  const latestStart = useRef(start)
  // Своя запись в ряд или двойник: её эхо-событие не пишется обратно, иначе запоздавшее эхо
  // откатывало бы ряд на шаг назад посреди прокрутки трекпадом.
  const echo = useRef({ row: Number.NaN, bar: Number.NaN })
  const [size, setSize] = useState<RowSize>({ view: 0, content: 0 })
  const overflows = size.content > size.view + 1

  useLayoutEffect(() => {
    latestStart.current = start
  })

  // Вид середины окна, однажды открытый, остаётся смонтированным и прячется: ряд, у которого
  // была нулевая ширина и появилась, - это вид открыли снова, и ряд встаёт к работе.
  useEffect(() => {
    const node = row.current
    const content = track.current

    if (!node || !content) return

    let wasShown = false
    const observer = new ResizeObserver(() => {
      const isShown = node.clientWidth > 0

      if (isShown && !wasShown) placeRow(node, latestStart.current)

      wasShown = isShown
      setSize({ view: node.clientWidth, content: node.scrollWidth })
    })

    observer.observe(node)
    observer.observe(content)

    return () => observer.disconnect()
  }, [])

  // Двойник появляется позже ряда (когда ряд перерос ширину) - встаёт туда, где ряд уже стоит.
  useLayoutEffect(() => {
    if (!overflows || !bar.current || !row.current) return

    echo.current.bar = row.current.scrollLeft
    bar.current.scrollLeft = row.current.scrollLeft
  }, [overflows])

  const handleRowScroll = () => {
    const left = row.current?.scrollLeft ?? 0

    if (!bar.current || Math.abs(left - echo.current.row) < 1) return

    echo.current.bar = left
    bar.current.scrollLeft = left
  }
  const handleBarScroll = () => {
    const left = bar.current?.scrollLeft ?? 0

    if (!row.current || Math.abs(left - echo.current.bar) < 1) return

    echo.current.row = left
    row.current.scrollLeft = left
  }

  return { row, track, bar, size, overflows, handleRowScroll, handleBarScroll }
}

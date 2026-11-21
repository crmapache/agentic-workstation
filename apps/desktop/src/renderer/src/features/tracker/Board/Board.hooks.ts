import type { RefObject, MouseEvent as ReactMouseEvent } from 'react'
import { useRef, useState, useEffect, useCallback } from 'react'

import type { BoardNeighbours } from '../tracker.utils'
import { DRAG_THRESHOLD_PX, AUTO_SCROLL_EDGE_PX, AUTO_SCROLL_STEP_PX } from './Board.constants'
import type { Rect, DropHit, BoardDrag, DropPlace, DragSource, BoardDragApi } from './Board.types'
import { placeOf, isSamePlace } from './Board.utils'

const rectOf = (node: Element): Rect => {
  const { left, top, width, height } = node.getBoundingClientRect()

  return { left, top, width, height }
}

/** Что под рукой: ближайший размеченный узел доски (data-атрибуты карточек, колонок, потоков). */
const hitAt = (x: number, y: number, kind: DragSource['kind']): DropHit | null => {
  const under = document.elementFromPoint(x, y)

  if (!under) return null

  if (kind === 'flow') {
    const flow = under.closest<HTMLElement>('[data-flow]')

    return flow?.dataset.flow ? { kind: 'flow', id: flow.dataset.flow, rect: rectOf(flow) } : null
  }

  const card = kind === 'card' ? under.closest<HTMLElement>('[data-card]') : null

  if (card?.dataset.card && card.dataset.group !== undefined)
    return {
      kind: 'card',
      id: card.dataset.card,
      groupId: card.dataset.group,
      followUp: card.dataset.followUp === 'true',
      rect: rectOf(card),
    }

  const chain = kind === 'card' ? under.closest<HTMLElement>('[data-chain]') : null

  if (chain?.dataset.chain && chain.dataset.group)
    return {
      kind: 'chain',
      rootId: chain.dataset.chain,
      groupId: chain.dataset.group,
      rect: rectOf(chain),
    }

  const group = under.closest<HTMLElement>('[data-group-column]')

  if (group?.dataset.groupColumn && group.dataset.flowId) {
    const end = group.querySelector('[data-group-end]')
    const head = group.querySelector('header')

    return {
      kind: 'group',
      id: group.dataset.groupColumn,
      flowId: group.dataset.flowId,
      rect: rectOf(group),
      head: rectOf(head ?? group),
      end: end ? rectOf(end) : null,
    }
  }

  const row = under.closest<HTMLElement>('[data-flow-row]')

  if (row?.dataset.flowRow) {
    const end = row.querySelector('[data-row-end]')

    return { kind: 'row', flowId: row.dataset.flowRow, end: end ? rectOf(end) : null }
  }

  return null
}

/** Клик, которым браузер закончит жест, - не открытие карточки: он перехватывается. */
const swallowEndingClick = () => {
  const swallow = (click: MouseEvent) => {
    click.stopPropagation()
    click.preventDefault()
  }

  window.addEventListener('click', swallow, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }))
}

/** Ряд, который листается вбок под рукой, или вся страница сверху вниз - шаг у края. */
const autoScroll = (scroller: HTMLElement | null, x: number, y: number) => {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-flow-row]')
  const step = (from: number, to: number, at: number) =>
    at < from + AUTO_SCROLL_EDGE_PX
      ? -AUTO_SCROLL_STEP_PX
      : at > to - AUTO_SCROLL_EDGE_PX
        ? AUTO_SCROLL_STEP_PX
        : 0

  if (row) {
    const box = row.getBoundingClientRect()

    row.scrollLeft += step(box.left, box.right, x)
  }

  if (scroller) {
    const box = scroller.getBoundingClientRect()

    scroller.scrollTop += step(box.top, box.bottom, y)
  }
}

/**
 * Перетаскивание по доске: карточки (в группах и цепочках), группы (между потоками), потоки.
 * Порог 4 пикселя, под рукой - призрак того, что несут, место показывает линия. У края ряда и
 * страницы - прокрутка сама. Esc - отмена; бросок на то же место ничего не шлёт.
 */
export const useBoardDrag = (
  neighbours: BoardNeighbours,
  scroller: RefObject<HTMLElement | null>,
  onDrop: (source: DragSource, place: DropPlace) => void,
): BoardDragApi => {
  const [drag, setDrag] = useState<BoardDrag | null>(null)
  const latest = useRef({ neighbours, onDrop })
  const frame = useRef<number | null>(null)

  useEffect(() => {
    latest.current = { neighbours, onDrop }
  })

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const press = useCallback(
    (event: ReactMouseEvent<HTMLElement>, source: DragSource) => {
      if (event.button !== 0) return

      const startX = event.clientX
      const startY = event.clientY
      const box = event.currentTarget.getBoundingClientRect()
      const grab = {
        dx: startX - box.left,
        dy: startY - box.top,
        width: box.width,
        height: box.height,
      }
      let current: BoardDrag | null = null
      let pointer = { x: startX, y: startY }

      const update = () => {
        if (!current) return

        const hit = hitAt(pointer.x, pointer.y, source.kind)
        const placed = hit
          ? placeOf(hit, pointer.x, pointer.y, source, latest.current.neighbours)
          : null

        current = {
          ...current,
          x: pointer.x,
          y: pointer.y,
          place: placed?.place ?? null,
          mark: placed?.mark ?? null,
        }
        setDrag(current)
      }
      const tick = () => {
        autoScroll(scroller.current, pointer.x, pointer.y)
        update()
        frame.current = requestAnimationFrame(tick)
      }
      const finish = (drop: boolean) => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        window.removeEventListener('keydown', handleKey, true)

        if (frame.current !== null) cancelAnimationFrame(frame.current)
        frame.current = null

        if (!current) return

        swallowEndingClick()

        const { place } = current

        if (drop && place && !isSamePlace(source, place, latest.current.neighbours))
          latest.current.onDrop(source, place)

        current = null
        setDrag(null)
      }
      const handleMove = (move: MouseEvent) => {
        pointer = { x: move.clientX, y: move.clientY }

        if (!current) {
          if (Math.hypot(pointer.x - startX, pointer.y - startY) < DRAG_THRESHOLD_PX) return

          current = { source, x: pointer.x, y: pointer.y, grab, place: null, mark: null }
          frame.current = requestAnimationFrame(tick)
        }

        update()
      }
      const handleUp = () => finish(true)
      const handleKey = (key: KeyboardEvent) => {
        if (key.key !== 'Escape' || !current) return

        key.preventDefault()
        key.stopPropagation()
        finish(false)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      window.addEventListener('keydown', handleKey, true)
    },
    [scroller],
  )

  return { drag, press }
}

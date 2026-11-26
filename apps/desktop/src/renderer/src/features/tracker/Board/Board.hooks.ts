import type { RefObject, MouseEvent as ReactMouseEvent } from 'react'
import { useRef, useState, useEffect, useCallback } from 'react'

import { placeOf, clipMark } from '../board-drop.utils'
import type { BoardNeighbours } from '../tracker.utils'
import { swallowEndingClick } from '../../../lib/drag-gesture'
import {
  DRAG_THRESHOLD_PX,
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_STEP_PX,
} from '../../../lib/drag-gesture.constants'
import { autoScrollStep } from '../../../lib/drag-gesture.utils'
import { chatDropAt, useChatDropStore } from '../../../state/chat-drop.store'
import type { Rect, DropHit, BoardDrag, BoardDrop, DragSource, BoardDragApi } from './Board.types'
import { isSamePlace } from './Board.utils'

const rectOf = (node: Element): Rect => {
  const { left, top, width, height } = node.getBoundingClientRect()

  return { left, top, width, height }
}

/** Зазор раскладки узла (флекс или сетка) в пикселях: между колонками (column) или рядами (row). */
const gapOf = (node: Element | null, axis: 'column' | 'row'): number => {
  if (!node) return 0

  const style = getComputedStyle(node)

  return Number.parseFloat(axis === 'column' ? style.columnGap : style.rowGap) || 0
}

/**
 * Ряд групп под рукой целиком: колонки по порядку с шапками - место группы считается по всему
 * ряду, а не только по колонке, над которой рука (в зазоре между колонками она ни над одной).
 */
const rowAt = (under: Element): DropHit | null => {
  const row = under.closest<HTMLElement>('[data-flow-row]')

  if (!row?.dataset.flowRow) return null

  const track = row.querySelector('[data-flow-track]')
  const end = row.querySelector('[data-row-end]')
  const columns = [...row.querySelectorAll<HTMLElement>('[data-group-column]')].map((column) => ({
    id: column.dataset.groupColumn ?? '',
    rect: rectOf(column),
    head: rectOf(column.querySelector('header') ?? column),
  }))

  return {
    kind: 'row',
    flowId: row.dataset.flowRow,
    columns,
    box: rectOf(row),
    end: end ? rectOf(end) : null,
    gap: gapOf(track, 'column'),
  }
}

/**
 * Карточка под рукой. Пустое место ряда задачи (под низкой карточкой рядом с высоким
 * продолжением, правее короткой цепочки) - карточка ряда, над которой стоит рука, или последняя
 * левее неё: иначе бросок в середину группы уходил бы в её конец.
 */
const cardAt = (under: Element, x: number): HTMLElement | null => {
  const card = under.closest<HTMLElement>('[data-card]')

  if (card) return card

  const cards = [
    ...(under.closest('[data-task-row]')?.querySelectorAll<HTMLElement>('[data-card]') ?? []),
  ]

  return cards.findLast((one) => one.getBoundingClientRect().left <= x) ?? cards[0] ?? null
}

/** Что под рукой: ближайший размеченный узел доски (data-атрибуты карточек, колонок, потоков). */
const hitAt = (x: number, y: number, kind: DragSource['kind']): DropHit | null => {
  const under = document.elementFromPoint(x, y)

  if (!under) return null

  if (kind === 'flow') {
    const flow = under.closest<HTMLElement>('[data-flow]')

    return flow?.dataset.flow
      ? {
          kind: 'flow',
          id: flow.dataset.flow,
          rect: rectOf(flow),
          gap: gapOf(flow.parentElement, 'row'),
        }
      : null
  }

  if (kind === 'group') return rowAt(under)

  const card = cardAt(under, x)
  const column = under.closest<HTMLElement>('[data-group-column]')
  // Ряды задач стоят в теле колонки (GroupBody): зазор между задачами - зазор тела, между
  // карточками цепочки - зазор их ряда.
  const body = column?.querySelector('[data-group-body]') ?? null

  if (card?.dataset.card && card.dataset.group !== undefined)
    return {
      kind: 'card',
      id: card.dataset.card,
      groupId: card.dataset.group,
      followUp: card.dataset.followUp === 'true',
      rect: rectOf(card),
      gap: gapOf(body, 'row'),
      chainGap: gapOf(card.parentElement, 'column'),
    }

  if (column?.dataset.groupColumn) {
    const end = column.querySelector('[data-group-end]')

    return {
      kind: 'group',
      id: column.dataset.groupColumn,
      end: end ? rectOf(end) : null,
      gap: gapOf(end?.parentElement ?? null, 'row'),
    }
  }

  return null
}

/** Ряд групп под рукой листается вбок, страница - сверху вниз: шаг у края, если есть куда. */
const autoScroll = (scroller: HTMLElement | null, x: number, y: number) => {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-flow-row]')

  if (row) {
    const box = row.getBoundingClientRect()

    row.scrollLeft += autoScrollStep(
      x,
      box,
      { before: row.scrollLeft, after: row.scrollWidth - row.clientWidth - row.scrollLeft },
      AUTO_SCROLL_EDGE_PX,
      AUTO_SCROLL_MAX_STEP_PX,
    )
  }

  if (scroller) {
    const box = scroller.getBoundingClientRect()

    scroller.scrollTop += autoScrollStep(
      y,
      { left: box.top, right: box.bottom },
      {
        before: scroller.scrollTop,
        after: scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop,
      },
      AUTO_SCROLL_EDGE_PX,
      AUTO_SCROLL_MAX_STEP_PX,
    )
  }
}

/**
 * Перетаскивание по доске: карточки (в группах и цепочках), группы (между потоками), потоки.
 * Порог 4 пикселя, под рукой - призрак того, что несут, место показывает линия. У края ряда и
 * страницы - прокрутка сама. Esc - отмена; своё же место не предлагается вовсе. Карточку можно
 * вынести с доски в поле чата ИИ - оно подсвечивается и примет её чипом (ADR 0127).
 */
export const useBoardDrag = (
  neighbours: BoardNeighbours,
  scroller: RefObject<HTMLElement | null>,
  onDrop: (source: DragSource, drop: BoardDrop) => void,
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

        const { neighbours } = latest.current
        const chat = source.kind === 'card' ? chatDropAt(pointer.x, pointer.y) : null
        const hit = chat ? null : hitAt(pointer.x, pointer.y, source.kind)
        const found = hit ? placeOf(hit, pointer.x, pointer.y, source, neighbours) : null
        // Место, где несомое и так стоит, не показывается: бросок туда ничего не меняет.
        const placed = found && !isSamePlace(source, found.place, neighbours) ? found : null
        const view = scroller.current ? rectOf(scroller.current) : null

        useChatDropStore.getState().setOver(chat)
        current = {
          ...current,
          x: pointer.x,
          y: pointer.y,
          place: placed?.place ?? null,
          mark: placed && view ? clipMark(placed.mark, view) : (placed?.mark ?? null),
          chat,
        }
        setDrag(current)
      }
      const tick = () => {
        // Над полем чата доска не листается: рука ушла с неё бросать, а не искать место.
        if (!current?.chat) autoScroll(scroller.current, pointer.x, pointer.y)
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
        useChatDropStore.getState().setOver(null)

        const { place, chat } = current

        if (drop && chat) latest.current.onDrop(source, { kind: 'chat', zone: chat })
        else if (drop && place) latest.current.onDrop(source, { kind: 'place', place })

        current = null
        setDrag(null)
      }
      const handleMove = (move: MouseEvent) => {
        pointer = { x: move.clientX, y: move.clientY }

        if (!current) {
          if (Math.hypot(pointer.x - startX, pointer.y - startY) < DRAG_THRESHOLD_PX) return

          current = {
            source,
            x: pointer.x,
            y: pointer.y,
            grab,
            place: null,
            mark: null,
            chat: null,
          }
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

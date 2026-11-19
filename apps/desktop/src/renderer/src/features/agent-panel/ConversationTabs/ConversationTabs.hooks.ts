import type { MouseEvent as ReactMouseEvent } from 'react'
import { useRef, useState, useCallback, useLayoutEffect } from 'react'

import { ADD_KEY, LANDING_MS, SWAP_GAP_PX, DRAG_THRESHOLD_PX } from './ConversationTabs.constants'
import type { Drag, Point, TabRect, DragView, StripTab } from './ConversationTabs.types'
import { rowFor, shotOf, placeOn, beforeOf, endsGroup } from './ConversationTabs.utils'

type Node = { conversation: StripTab; node: HTMLDivElement }

/** Перестановки; ответ - id вкладок полосы после неё (null - не вышло). */
type Reorder = {
  moveGroup: (groupId: string, before: string | null) => Promise<readonly string[] | null>
  moveTab: (conversationId: string, before: string | null) => Promise<readonly string[] | null>
}

const IDLE: DragView = { drag: null, offset: { x: 0, y: 0 }, shifts: {}, reach: null }

/** К какой единице жеста вкладка: своя группа, сам форк внутри группы или ничья. */
const unitOf = (conversation: StripTab, drag: Drag): string | undefined => {
  if (drag.kind === 'group') return conversation.groupId

  return conversation.groupId === drag.groupId ? conversation.id : undefined
}

const nodeTab = ({ conversation }: Node): StripTab => conversation

/** Где стоят вкладки и «+» (под ADD_KEY): он не вкладка, но едет с рядом так же. */
const layoutOf = (nodes: readonly Node[], add: HTMLElement | null) =>
  new Map([
    ...nodes.map(
      ({ conversation, node }) =>
        [conversation.id, { x: node.offsetLeft, y: node.offsetTop }] as const,
    ),
    ...(add ? [[ADD_KEY, { x: add.offsetLeft, y: add.offsetTop }] as const] : []),
  ])

/** Узлы полосы в порядке разговоров: тот, что ещё не смонтирован, пропускается. */
const orderedNodes = (
  conversations: readonly StripTab[],
  nodes: ReadonlyMap<string, HTMLDivElement>,
): Node[] =>
  conversations.flatMap((conversation) => {
    const node = nodes.get(conversation.id)

    return node ? [{ conversation, node }] : []
  })

/**
 * Вернуть полосе порядок разметки: снять order, переставленный зазор групп и место под «+»
 * у последней.
 */
const unhold = (nodes: ReadonlyMap<string, HTMLDivElement>, add: HTMLElement | null) => {
  for (const node of nodes.values()) {
    node.style.order = ''
    delete node.dataset['groupEnd']
    delete node.dataset['tail']
    delete node.dataset['untail']
  }

  if (add) add.style.order = ''
}

/** Сколько вкладка сейчас сдвинута от своего места - у браузера, с учётом идущего перехода. */
const liveShift = (node: HTMLElement): Point => {
  const { transform } = getComputedStyle(node)

  if (!transform || transform === 'none') return { x: 0, y: 0 }

  const matrix = new DOMMatrixReadOnly(transform)

  return { x: matrix.m41, y: matrix.m42 }
}

/**
 * Перетаскивание вкладок, как в ACC: порог 4 пикселя, движение по обеим осям, перенос
 * между рядами. Голова группы несёт группу, форк - себя внутри группы (в группе из двух -
 * всю группу). Соседи встают туда, куда их поставит отпускание: полоса раскладывается в
 * будущем порядке через flex order, меряется и возвращается - кадр этого не видит.
 * Порядок хранит главный процесс; до его ответа полоса держит новый порядок через order.
 */
export const useTabDrag = (conversations: readonly StripTab[], reorder: Reorder) => {
  const stripRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLSpanElement>(null)
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const latest = useRef({ conversations, reorder })
  const dragged = useRef(false)
  const landing = useRef<Map<string, Point & { shifted: boolean }> | null>(null)
  const held = useRef(false)
  const [view, setView] = useState<DragView>(IDLE)
  const signature = conversations.map((conversation) => conversation.id).join()

  useLayoutEffect(() => {
    latest.current = { conversations, reorder }
  })

  // Пришёл порядок от главного процесса - order больше не нужен: DOM уже в том же порядке.
  useLayoutEffect(() => {
    if (!held.current) return

    held.current = false
    unhold(nodes.current, addRef.current)
  }, [signature])

  // Приземление: с того места, где вкладка была нарисована в миг отпускания, - в новое.
  useLayoutEffect(() => {
    const was = landing.current

    if (!was) return

    landing.current = null

    const add = addRef.current
    const landed = [
      ...orderedNodes(conversations, nodes.current).map(({ conversation, node }) => ({
        key: conversation.id,
        node,
      })),
      ...(add ? [{ key: ADD_KEY, node: add }] : []),
    ]

    for (const { key, node } of landed) {
      const from = was.get(key)
      const dx = from ? from.x - node.offsetLeft : 0
      const dy = from ? from.y - node.offsetTop : 0

      if (from && (dx || dy || from.shifted)) {
        node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
          duration: LANDING_MS,
          easing: 'ease',
        })
      }
    }
  })

  const register = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
  }, [])

  const ordered = () => orderedNodes(latest.current.conversations, nodes.current)

  /** Разложить полосу в порядке, который даст отпускание; keep - не возвращать назад. */
  const project = (drag: Drag, before: string | null, keep: boolean) => {
    const strip = stripRef.current
    const all = ordered()
    const carried = all.filter((item) => unitOf(item.conversation, drag) === drag.id)
    const rest = all.filter((item) => unitOf(item.conversation, drag) !== drag.id)
    const at =
      before === null
        ? rest.findLastIndex((item) => unitOf(item.conversation, drag) !== undefined) + 1
        : rest.findIndex((item) => unitOf(item.conversation, drag) === before)

    if (!strip || at < 0) return null

    const asked = strip.style.minHeight

    strip.style.minHeight = ''

    const height = strip.offsetHeight
    const sequence = [...rest.slice(0, at), ...carried, ...rest.slice(at)]

    sequence.forEach(({ node }, order) => {
      node.style.order = String(order)
    })

    const add = addRef.current

    if (add) add.style.order = String(sequence.length)

    // Место под «+» держит последняя вкладка, а :last-child - по разметке: роль отдаётся
    // той, что встанет последней, и снимается с последней по разметке (стили - data-tail).
    const tail = sequence.at(-1)?.node
    const markedTail = all.at(-1)?.node

    if (tail && markedTail && tail !== markedTail) {
      tail.dataset['tail'] = ''
      markedTail.dataset['untail'] = ''
    }

    // Зазор групп стоит по разметке (groupEnd), а order её не трогает: вкладка, которая в
    // новом порядке закроет группу или перестанет её закрывать, получает его через
    // data-group-end. Последней он не нужен - её место под «+» держит data-tail.
    const markedTabs = all.map(nodeTab)
    const projectedTabs = sequence.map(nodeTab)
    const markedEnds = new Set(
      all.filter((_, index) => endsGroup(markedTabs, index)).map(({ node }) => node),
    )

    sequence.slice(0, -1).forEach(({ node }, index) => {
      const ends = endsGroup(projectedTabs, index)

      if (ends !== markedEnds.has(node)) node.dataset['groupEnd'] = ends ? 'on' : 'off'
    })

    const projected = layoutOf(sequence, add)
    const projectedHeight = strip.offsetHeight

    if (!keep) unhold(nodes.current, add)

    strip.style.minHeight = asked

    return { projected, height: projectedHeight > height ? projectedHeight : null, carried }
  }

  const shiftsFor = (drag: Drag, laid: Map<string, Point>, before: string | null) => {
    const result = project(drag, before, false)
    const shifts: Record<string, Point> = {}

    if (!result) return { shifts, reach: null }

    const travelling = new Set(result.carried.map((item) => item.conversation.id))

    for (const [id, to] of result.projected) {
      const was = laid.get(id)

      if (was && !travelling.has(id) && (to.x !== was.x || to.y !== was.y)) {
        shifts[id] = { x: to.x - was.x, y: to.y - was.y }
      }
    }

    return { shifts, reach: result.height }
  }

  const begin = (drag: Drag, gripId: string) => {
    const all = ordered()
    const rects: TabRect[] = all.map(({ conversation, node }) => ({
      key: conversation.id,
      unit: unitOf(conversation, drag),
      left: node.offsetLeft,
      right: node.offsetLeft + node.offsetWidth,
      top: node.offsetTop,
    }))
    const shot = shotOf(rects)
    const from = shot.units.indexOf(drag.id)
    const grip = rects.find((rect) => rect.key === gripId)
    const line = grip ? shot.lines.indexOf(grip.top) : -1
    const carried = shot.boxes.find((box) => box.index === from && box.line === line)

    if (from < 0 || !grip || !carried) return null

    // Вверх и вниз - только в пределах рядов жеста: полоса в один ряд держит вкладку в нём.
    return {
      shot,
      from,
      carried,
      laid: layoutOf(all, addRef.current),
      rowTop: grip.top,
      highest: (shot.lines[0] ?? grip.top) - grip.top,
      lowest: (shot.lines.at(-1) ?? grip.top) - grip.top,
    }
  }

  const onPress = (event: ReactMouseEvent<HTMLDivElement>, drag: Drag, gripId: string) => {
    dragged.current = false

    const target = event.target as HTMLElement
    const button = target.closest('button')

    // Крестик - кнопка, а не ручка; поле имени - место для каретки.
    if (event.button !== 0 || (button && button.getAttribute('role') !== 'tab')) return
    if (target.closest('input')) return

    const focused = document.activeElement

    // Нажатие сначала кладёт поле имени, открытое в другой вкладке, с набранным.
    if (focused instanceof HTMLInputElement && stripRef.current?.contains(focused)) focused.blur()

    event.preventDefault()

    const startX = event.clientX
    const startY = event.clientY
    const floor = drag.kind === 'tab' ? 1 : 0
    let gesture: ReturnType<typeof begin> | undefined
    let started = false
    let place = 0
    let shown = 0
    let row = 0

    const onMove = (move: MouseEvent) => {
      if (gesture === undefined) {
        // Снимок - на первом движении: нажатие только что положило поле имени.
        gesture = begin(drag, gripId)
        place = gesture?.from ?? 0
        shown = place
        row = gesture?.carried.line ?? 0
      }

      if (!gesture) return onUp()

      const { shot, from, carried, laid, rowTop, highest, lowest } = gesture
      const dx = move.clientX - startX
      const dy = Math.min(Math.max(move.clientY - startY, highest), lowest)

      if (!started && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return

      started = true
      row = rowFor(shot.lines, rowTop + dy, row)

      const wanted = Math.max(floor, placeOn(shot.boxes, from, carried, row, dx))
      const backOff = wanted > place ? -SWAP_GAP_PX : SWAP_GAP_PX

      if (
        wanted !== place &&
        Math.max(floor, placeOn(shot.boxes, from, carried, row, dx + backOff)) === wanted
      ) {
        place = wanted
      }

      const projection =
        place === shown
          ? null
          : place === from
            ? { shifts: {}, reach: null }
            : shiftsFor(drag, laid, beforeOf(shot.units, from, place))

      shown = place
      setView((current) => ({ ...current, drag, offset: { x: dx, y: dy }, ...projection }))
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      if (started && gesture) {
        dragged.current = true
        drop(drag, gesture.from, place, gesture.shot.units)
      }

      setView(IDLE)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /** Отпустили: картина под рукой запоминается для приземления, порядок держит order. */
  const drop = (drag: Drag, from: number, place: number, units: readonly string[]) => {
    const rendered = new Map<string, Point & { shifted: boolean }>()

    const add = addRef.current
    const shown = [
      ...ordered().map(({ conversation, node }) => ({ key: conversation.id, node })),
      ...(add ? [{ key: ADD_KEY, node: add }] : []),
    ]

    for (const { key, node } of shown) {
      const live = liveShift(node)

      rendered.set(key, {
        x: node.offsetLeft + live.x,
        y: node.offsetTop + live.y,
        shifted: Boolean(live.x || live.y),
      })
    }

    landing.current = rendered

    if (place === from) return

    const before = beforeOf(units, from, place)
    const orderBefore = latest.current.conversations.map((conversation) => conversation.id).join()

    held.current = project(drag, before, true) !== null

    const move =
      drag.kind === 'tab' ? latest.current.reorder.moveTab : latest.current.reorder.moveGroup

    void move(drag.id, before).then((ids) => {
      // Главный процесс порядок не поменял - вернуть полосу как была.
      if (held.current && (!ids || ids.join() === orderBefore)) {
        held.current = false
        unhold(nodes.current, addRef.current)
      }
    })
  }

  return { stripRef, addRef, register, view, onPress, wasDragged: () => dragged.current }
}

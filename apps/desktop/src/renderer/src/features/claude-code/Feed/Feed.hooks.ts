import type { MouseEvent, PointerEvent } from 'react'
import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react'

import type { FeedRow } from '../claude.types'
import { useFeedStore } from '../feed.store'
import {
  LIT_MS,
  HOLD_MS,
  STALL_MS,
  ROW_ATTRIBUTE,
  JUMP_TOP_SHARE,
  PIN_THRESHOLD_PX,
} from './Feed.constants'
import { rowAtEdge } from './Feed.utils'

type Kept = { row: Element; top: number }

type Held = Kept & { until: number }

const isAtBottom = (scroller: HTMLElement) =>
  scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= PIN_THRESHOLD_PX

const rowOf = (target: EventTarget | null) =>
  target instanceof Element ? target.closest(`[${ROW_ATTRIBUTE}]`) : null

/** Строки ленты и номер той, что у верхней кромки окна прокрутки, - она читается первой. */
const rowsAtTop = (scroller: HTMLElement) => {
  const rows = scroller.querySelectorAll(`[${ROW_ATTRIBUTE}]`)
  const edge = scroller.getBoundingClientRect().top
  const index = rowAtEdge(rows.length, (at) => rows[at]?.getBoundingClientRect().bottom ?? 0, edge)

  return { rows, index, edge }
}

/**
 * Прокрутка ленты, как в ACC. Держится у низа, пока человек сам не отлистал вверх. Строка,
 * в которой что-то раскрыли, остаётся на месте - раскрытое растёт вниз, а не уводит ленту
 * к концу. Место чтения по вкладке переживает переключение (строкой, а не пикселями).
 * Страница ранней истории встаёт выше, не сдвигая читаемое; полка закреплённых - тоже.
 */
export const useFeedScroll = (
  conversationId: string,
  pinKey: string | undefined,
  pages: number,
  pinsHeight: number,
) => {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const lastTop = useRef(0)
  const pressed = useRef<{ row: Element; top: number } | null>(null)
  const held = useRef<Held | null>(null)
  const kept = useRef<Kept | null>(null)
  const measured = useRef({ pages, height: 0, top: 0, pins: pinsHeight })
  const [isAway, setIsAway] = useState(false)
  const [lit, setLit] = useState<string | null>(null)
  const setPlace = useFeedStore((store) => store.setPlace)

  const setStick = useCallback((value: boolean) => {
    stick.current = value
    setIsAway(!value)
  }, [])

  /** Лента выросла: придержанную строку - на место, иначе к низу, если держимся у низа. */
  const follow = useCallback(() => {
    const scroller = scrollerRef.current
    const holding = held.current

    if (!scroller) return

    if (holding) {
      if (!holding.row.isConnected || performance.now() > holding.until) held.current = null
      else {
        scroller.scrollTop += holding.row.getBoundingClientRect().top - holding.top
        setStick(isAtBottom(scroller))

        return
      }
    }

    if (stick.current) scroller.scrollTop = scroller.scrollHeight
    else if (isAtBottom(scroller)) setStick(true)
  }, [setStick])

  const remember = useCallback(() => {
    const scroller = scrollerRef.current

    if (!scroller) return

    const { rows, index, edge } = rowsAtTop(scroller)
    const row = rows[index]

    setPlace(conversationId, {
      atEnd: stick.current,
      rowId: row?.getAttribute(ROW_ATTRIBUTE) ?? null,
      offset: row ? row.getBoundingClientRect().top - edge : 0,
      scrollTop: scroller.scrollTop,
    })
    measured.current = {
      ...measured.current,
      height: scroller.scrollHeight,
      top: scroller.scrollTop,
    }
  }, [conversationId, setPlace])

  /**
   * Перед страницей выше: запомнить строку у верхней кромки там, где её видно сейчас.
   * Пришедшая страница поставит её туда же - по самой строке, а не по разнице высоты ленты:
   * высота врёт, пока строки вне экрана стоят на примерной высоте (content-visibility).
   * Самая первая строка ленты не годится: группа вызовов склеивается с вызовами из новой
   * страницы и встаёт новой строкой под другим id - держится следующая за ней.
   */
  const keepPlace = useCallback(() => {
    const scroller = scrollerRef.current

    if (!scroller) return

    const { rows, index } = rowsAtTop(scroller)
    const row = rows[index === 0 && rows.length > 1 ? 1 : index]

    kept.current = row ? { row, top: row.getBoundingClientRect().top } : null
  }, [])

  const jumpToBottom = useCallback(() => {
    const scroller = scrollerRef.current

    held.current = null
    setStick(true)

    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [setStick])

  /**
   * Прыжок к строке (булавка на полке, находка поиска): строка - в верхнюю треть, на миг
   * подсвечена. Там она и держится HOLD_MS: строки над ней, только что пришедшие страницей,
   * раскладываются своей настоящей высотой уже после прыжка и увели бы её под полку.
   */
  const goToRow = useCallback(
    (rowId: string) => {
      const scroller = scrollerRef.current
      const row = scroller?.querySelector(`[${ROW_ATTRIBUTE}="${CSS.escape(rowId)}"]`)

      if (!scroller || !row) return

      setStick(false)
      scroller.scrollTop +=
        row.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        scroller.clientHeight * JUMP_TOP_SHARE
      held.current = {
        row,
        top: row.getBoundingClientRect().top,
        until: performance.now() + HOLD_MS,
      }
      setLit(rowId)
    },
    [setStick],
  )

  useEffect(() => {
    if (!lit) return

    const timer = window.setTimeout(() => setLit(null), LIT_MS)

    return () => window.clearTimeout(timer)
  }, [lit])

  useEffect(() => {
    const content = contentRef.current
    const scroller = scrollerRef.current

    if (!content || !scroller) return

    const observer = new ResizeObserver(follow)

    observer.observe(content)
    observer.observe(scroller)

    return () => observer.disconnect()
  }, [follow])

  // Вкладка вернулась: лента встаёт туда, где её читали, - строкой, а не числом пикселей.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const place = useFeedStore.getState().places[conversationId]

    if (!scroller || !place || place.atEnd) return

    const edge = scroller.getBoundingClientRect().top
    const row = place.rowId
      ? scroller.querySelector(`[${ROW_ATTRIBUTE}="${CSS.escape(place.rowId)}"]`)
      : null

    if (row) {
      scroller.scrollTop += row.getBoundingClientRect().top - edge - place.offset
      held.current = { row, top: edge + place.offset, until: performance.now() + HOLD_MS }
    } else {
      scroller.scrollTop = place.scrollTop
    }

    setStick(isAtBottom(scroller))
  }, [conversationId, setStick])

  // Человек отправил сообщение - к низу в любом случае. На открытии вкладки - нет: там
  // место чтения, которое только что вернули.
  const sentKey = useRef(pinKey)

  useLayoutEffect(() => {
    if (pinKey === sentKey.current) return

    sentKey.current = pinKey
    jumpToBottom()
  }, [pinKey, jumpToBottom])

  // Страница выше пришла или полка сменила высоту - читаемое остаётся на месте. Строку,
  // запомненную нажатием, лента и держит ещё HOLD_MS: строки новой страницы у кромки
  // раскладываются уже после отрисовки и сдвинули бы её своей настоящей высотой.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const before = measured.current
    const place = kept.current

    if (!scroller) return

    if (before.pages !== pages && place?.row.isConnected) {
      kept.current = null
      scroller.scrollTop += place.row.getBoundingClientRect().top - place.top
      held.current = { ...place, until: performance.now() + HOLD_MS }
      setStick(isAtBottom(scroller))
    } else if (!stick.current && before.pages !== pages) {
      scroller.scrollTop = before.top + (scroller.scrollHeight - before.height)
    } else if (!stick.current && before.pins !== pinsHeight) {
      scroller.scrollTop += pinsHeight - before.pins
    }

    measured.current = {
      pages,
      pins: pinsHeight,
      height: scroller.scrollHeight,
      top: scroller.scrollTop,
    }
  })

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current

    if (!scroller) return

    const movedUp = scroller.scrollTop < lastTop.current - 1

    lastTop.current = scroller.scrollTop

    // Отлипает только от прокрутки вверх: ход растёт внизу, и подстройка якоря браузером
    // по одному расстоянию читалась бы как «отлистали».
    if (isAtBottom(scroller)) setStick(true)
    else if (movedUp && !held.current) setStick(false)

    remember()
  }, [remember, setStick])

  const handlePointerDown = useCallback((event: PointerEvent) => {
    const row = rowOf(event.target)

    pressed.current = row ? { row, top: row.getBoundingClientRect().top } : null
  }, [])

  // Нажатие раскрыло карточку - её строка держится на месте, пока карточка растёт.
  const handleClick = useCallback((event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    const folds = target?.closest('[aria-expanded], [data-feed-fold]')

    if (folds && pressed.current)
      held.current = { ...pressed.current, until: performance.now() + HOLD_MS }
  }, [])

  return {
    scrollerRef,
    contentRef,
    isAway,
    lit,
    jumpToBottom,
    goToRow,
    keepPlace,
    handleScroll,
    handlePointerDown,
    handleClick,
  }
}

/**
 * Сколько строк пришло, пока лента не у низа: считается от последней увиденной строки, а
 * не по числу строк - страница истории встаёт выше и непрочитанным не считается. Свои
 * сообщения не в счёт.
 */
export const useUnread = (rows: readonly FeedRow[], isAway: boolean): number => {
  const [seenId, setSeenId] = useState<string | undefined>(rows.at(-1)?.id)
  const tailId = rows.at(-1)?.id

  if (!isAway && seenId !== tailId) setSeenId(tailId)

  const seenAt = seenId === undefined ? -1 : rows.findIndex((row) => row.id === seenId)

  if (!isAway || (seenId !== undefined && seenAt < 0)) return 0

  return rows.slice(seenAt + 1).filter((row) => row.kind !== 'user').length
}

/**
 * Застыла ли лента: с последнего изменения прошло больше STALL_MS. Перелив строки статуса
 * тогда гаснет - работа стоит, и бегущий блик врал бы, что что-то происходит.
 */
export const useStalled = (items: readonly unknown[], now: number): boolean => {
  const [changedAt, setChangedAt] = useState(now)
  const [seen, setSeen] = useState(items)

  if (seen !== items) {
    setSeen(items)
    setChangedAt(now)
  }

  return now - changedAt > STALL_MS
}

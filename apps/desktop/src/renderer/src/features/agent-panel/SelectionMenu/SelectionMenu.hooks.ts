import { useState, useEffect } from 'react'
import type { RefObject } from 'react'

import { ROW_ATTRIBUTE } from '../Feed/Feed.constants'
import type { FeedSelection } from './SelectionMenu.types'

/** Выделение внутри области ленты; пустое, вне её или в поле ввода - null. */
const readSelection = (area: HTMLElement): FeedSelection | null => {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  const start =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement
  const row = start?.closest(`[${ROW_ATTRIBUTE}]`)
  const text = selection.toString().trim()

  if (!area.contains(range.commonAncestorContainer) || !row || !text) return null
  if (start?.closest('input, textarea, [contenteditable="true"]')) return null

  const { top, bottom, left, right } = range.getBoundingClientRect()

  return { text, rect: { top, bottom, left, right }, rowId: row.getAttribute(ROW_ATTRIBUTE) ?? '' }
}

/**
 * Выделение в ленте - после того, как его закончили (отпустили кнопку мыши или клавишу),
 * чтобы меню не прыгало за курсором во время протяжки; снятое выделение прячет меню сразу.
 * Протяжка начинается в ленте, а кончиться может где угодно: выделение часто отпускают чуть
 * левее края панели, и меню должно встать и тогда.
 */
export const useFeedSelection = (areaRef: RefObject<HTMLDivElement | null>) => {
  const [current, setCurrent] = useState<FeedSelection | null>(null)

  useEffect(() => {
    const area = areaRef.current

    if (!area) return

    const settle = () => requestAnimationFrame(() => setCurrent(readSelection(area)))
    const stop = () => {
      window.removeEventListener('pointerup', handleRelease)
      window.removeEventListener('pointermove', handleMove)
    }
    const handleRelease = () => {
      stop()
      settle()
    }
    // Отпускание за краем окна pointerup может не принести: первое движение без нажатой кнопки
    // кончает протяжку так же.
    const handleMove = (event: PointerEvent) => {
      if ((event.buttons & 1) === 0) handleRelease()
    }
    const handlePress = (event: PointerEvent) => {
      if (event.button !== 0) return

      stop()
      window.addEventListener('pointerup', handleRelease)
      window.addEventListener('pointermove', handleMove)
    }
    const handleChange = () => {
      if (window.getSelection()?.isCollapsed !== false) setCurrent(null)
    }

    area.addEventListener('pointerdown', handlePress)
    area.addEventListener('keyup', settle)
    document.addEventListener('selectionchange', handleChange)

    return () => {
      stop()
      area.removeEventListener('pointerdown', handlePress)
      area.removeEventListener('keyup', settle)
      document.removeEventListener('selectionchange', handleChange)
    }
  }, [areaRef])

  return { selection: current, clear: () => setCurrent(null) }
}

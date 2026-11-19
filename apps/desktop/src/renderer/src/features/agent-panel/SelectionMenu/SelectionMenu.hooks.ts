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
 */
export const useFeedSelection = (areaRef: RefObject<HTMLDivElement | null>) => {
  const [current, setCurrent] = useState<FeedSelection | null>(null)

  useEffect(() => {
    const area = areaRef.current

    if (!area) return

    const settle = () => requestAnimationFrame(() => setCurrent(readSelection(area)))
    const handleChange = () => {
      if (window.getSelection()?.isCollapsed !== false) setCurrent(null)
    }

    area.addEventListener('pointerup', settle)
    area.addEventListener('keyup', settle)
    document.addEventListener('selectionchange', handleChange)

    return () => {
      area.removeEventListener('pointerup', settle)
      area.removeEventListener('keyup', settle)
      document.removeEventListener('selectionchange', handleChange)
    }
  }, [areaRef])

  return { selection: current, clear: () => setCurrent(null) }
}

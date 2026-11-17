import { quoteOf } from '../../../lib/quotes.utils'
import { BOTTOM_STRIP_PX, QUOTABLE_SELECTOR } from './QuoteButton.constants'
import type { QuotePlacement, QuotableSelection } from './QuoteButton.types'

const quotableAt = (body: HTMLElement, node: Node): boolean => {
  const element = node instanceof Element ? node : node.parentElement

  return !!element && body.contains(element) && !!element.closest(QUOTABLE_SELECTOR)
}

/**
 * Кнопка - внизу, у поля ввода. Выделенное лежит в нижней полосе и не доходит до верха - кнопка
 * закрыла бы его, и она встаёт наверх.
 */
export const placementOf = (
  selected: Pick<DOMRect, 'top' | 'bottom'>,
  body: Pick<DOMRect, 'top' | 'bottom'>,
): QuotePlacement =>
  selected.bottom > body.bottom - BOTTOM_STRIP_PX && selected.top > body.top + BOTTOM_STRIP_PX
    ? 'top'
    : 'bottom'

/** Выделенное в ленте, если оба его конца - в тексте ответа и его хватает на цитату. */
export const quotableSelection = (body: HTMLElement | null): QuotableSelection | null => {
  const selection = window.getSelection()

  if (!body || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const range = selection.getRangeAt(0)

  if (!quotableAt(body, range.startContainer) || !quotableAt(body, range.endContainer)) return null

  const text = quoteOf(selection.toString())

  if (!text) return null

  return {
    text,
    placement: placementOf(range.getBoundingClientRect(), body.getBoundingClientRect()),
  }
}

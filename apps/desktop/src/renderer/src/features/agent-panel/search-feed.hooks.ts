import { useRef, useEffect, useLayoutEffect, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'

import type { PaintedTerm } from '@shared/claude-search'
import { matchSpans } from '@shared/claude-search-words'
import type { FeedItem } from '@shared/conversation-feed'

import { formulasVersion, subscribeFormulas } from './formulas'
import {
  HIGHLIGHT_NAME,
  JUMP_PAGE_LIMIT,
  PAINT_INTERVAL_MS,
  PAINT_SKIP_SELECTOR,
} from './search.constants'
import { useSearchStore } from './search.store'
import { rowForHit } from './search.utils'

const NO_TERMS: readonly PaintedTerm[] = []

/** Реестр подсветок браузера (CSS Custom Highlight API); нет его - не красить. */
const highlights = (): HighlightRegistry | undefined =>
  typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : undefined

/** Текстовые узлы ленты, кроме нарисованных формул и скрытого исходника для копирования. */
const textNodes = (root: Element): Text[] => {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node instanceof Element
        ? node.matches(PAINT_SKIP_SELECTOR)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP
        : NodeFilter.FILTER_ACCEPT,
  })

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text && node.data.trim()) nodes.push(node)
  }

  return nodes
}

/**
 * Найденные слова - подсветкой по всей ленте, пока над этим разговором стоит капсула.
 * Через реестр подсветок, а не обёртками в тексте: разметка карточек не трогается.
 * Новые слова красятся сразу, изменения самой ленты (печатается ответ) - не чаще
 * PAINT_INTERVAL_MS, а стоящая подсветка между проходами не снимается: мигание хуже, чем
 * на миг сдвинутый диапазон. Формула, нарисованная позже, - повод покрасить заново.
 */
export const useSearchPaint = (
  contentRef: RefObject<HTMLElement | null>,
  conversationId: string,
  items: readonly FeedItem[],
) => {
  const terms = useSearchStore((store) =>
    store.capsule?.conversationId === conversationId ? store.capsule.terms : NO_TERMS,
  )
  const formulas = useSyncExternalStore(subscribeFormulas, formulasVersion)
  const painted = useRef<{ terms: readonly PaintedTerm[]; at: number } | null>(null)

  useEffect(() => {
    const registry = highlights()

    if (!registry) return

    if (terms.length === 0) {
      registry.delete(HIGHLIGHT_NAME)
      painted.current = null

      return
    }

    const apply = () => {
      const root = contentRef.current

      if (!root) return

      const ranges: Range[] = []

      for (const node of textNodes(root)) {
        for (const [start, end] of matchSpans(node.data, terms)) {
          const range = document.createRange()

          range.setStart(node, start)
          range.setEnd(node, end)
          ranges.push(range)
        }
      }

      registry.set(HIGHLIGHT_NAME, new Highlight(...ranges))
      painted.current = { terms, at: Date.now() }
    }

    const last = painted.current
    const wait = last?.terms === terms ? Math.max(0, PAINT_INTERVAL_MS - (Date.now() - last.at)) : 0

    if (wait === 0) {
      apply()

      return
    }

    const timer = window.setTimeout(apply, wait)

    return () => window.clearTimeout(timer)
  }, [contentRef, terms, items, formulas])

  // Подсветка уходит вместе с лентой, над которой её нарисовали.
  useEffect(
    () => () => {
      highlights()?.delete(HIGHLIGHT_NAME)
    },
    [],
  )
}

type JumpFeed = {
  conversationId: string
  items: readonly FeedItem[]
  goToRow: (rowId: string) => void
  hasEarlier: boolean
  isLoadingEarlier: boolean
  loadEarlier: () => void
}

/**
 * Прыжок ленты к выбранной находке: строка в верхнюю треть, на миг подсвечена, лента
 * отлипает от низа. Находка выше загруженного тянет страницы вверх, но не больше
 * JUMP_PAGE_LIMIT; в начале разговора или на потолке капсула честно говорит «нет среди
 * загруженных». До отрисовки: вуаль гаснет поверх кадра, где строка уже на месте.
 */
export const useSearchJump = ({
  conversationId,
  items,
  goToRow,
  hasEarlier,
  isLoadingEarlier,
  loadEarlier,
}: JumpFeed) => {
  const focus = useSearchStore((store) =>
    store.focus?.conversationId === conversationId ? store.focus : null,
  )
  const pages = useRef({ nonce: 0, count: 0 })

  useLayoutEffect(() => {
    if (!focus) return

    if (pages.current.nonce !== focus.nonce) pages.current = { nonce: focus.nonce, count: 0 }

    const row = rowForHit(items, focus.hit)
    const { landHit } = useSearchStore.getState()

    if (row) {
      goToRow(row)
      landHit(focus.nonce, 'none')

      return
    }

    if (isLoadingEarlier) return

    if (hasEarlier && pages.current.count < JUMP_PAGE_LIMIT) {
      pages.current.count += 1
      loadEarlier()

      return
    }

    landHit(focus.nonce, 'missing')
  }, [focus, items, goToRow, hasEarlier, isLoadingEarlier, loadEarlier])
}

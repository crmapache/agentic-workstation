import { PAINT_SKIP_SELECTOR } from './search.constants'
import { LIT_MS } from './Feed/Feed.constants'

/**
 * Текст ленты в DOM: подсветка найденных слов поиска и место цитаты внутри строки. Через
 * реестр подсветок браузера, а не обёртками в тексте: разметка карточек не трогается.
 */

/** Подсветка места цитаты - то же имя, что у `::highlight(feed-quote)` в Feed.module.scss. */
const QUOTE_HIGHLIGHT = 'feed-quote'

let quoteFade = 0

/** Реестр подсветок браузера (CSS Custom Highlight API); нет его - не красить. */
export const highlights = (): HighlightRegistry | undefined =>
  typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : undefined

/** Текстовые узлы ленты, кроме нарисованных формул и скрытого исходника для копирования. */
export const textNodes = (root: Element): Text[] => {
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
 * Знаки без пробелов и переносов, строчными: выделение несёт переносы между блоками, DOM -
 * нет. По единицам строки, как идёт обход узлов: иначе строчная пары и половинок разошлись бы.
 */
const compact = (text: string): string => {
  let out = ''

  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at)

    if (!/\s/.test(char)) out += char.toLowerCase()
  }

  return out
}

/** Где в строке слова needle (уже compact): диапазон от первого знака до последнего. */
const rangeOf = (root: Element, needle: string): Range | null => {
  const places: { node: Text; at: number }[] = []
  let text = ''

  for (const node of textNodes(root)) {
    for (let at = 0; at < node.data.length; at += 1) {
      const lowered = compact(node.data.charAt(at))

      text += lowered
      for (let step = 0; step < lowered.length; step += 1) places.push({ node, at })
    }
  }

  const start = needle ? text.indexOf(needle) : -1
  const first = places[start]
  const last = places[start + needle.length - 1]

  if (start < 0 || !first || !last) return null

  const range = document.createRange()

  range.setStart(first.node, first.at)
  range.setEnd(last.node, last.at + 1)

  return range
}

/**
 * Слова цитаты внутри строки ленты: выделение брали с экрана, поэтому они есть в её тексте,
 * только с другими пробелами и регистром не важен. Выделение, начатое в этой строке и
 * ушедшее в следующую, целиком в ней не найдётся - тогда его первая строка. null - нет и её.
 */
export const quoteRange = (root: Element, quote: string): Range | null => {
  const head = quote.split('\n').find((line) => line.trim()) ?? ''

  return rangeOf(root, compact(quote)) ?? rangeOf(root, compact(head))
}

/** Место цитаты на миг подсвечено - столько же, сколько строка, к которой прыгнули. */
export const flashQuote = (range: Range): void => {
  const registry = highlights()

  if (!registry) return

  registry.set(QUOTE_HIGHLIGHT, new Highlight(range))
  window.clearTimeout(quoteFade)
  quoteFade = window.setTimeout(() => registry.delete(QUOTE_HIGHLIGHT), LIT_MS)
}

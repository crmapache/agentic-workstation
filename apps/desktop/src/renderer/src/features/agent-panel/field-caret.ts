import type { DraftToken } from '@shared/message-draft'

import type { ChipOf } from './field-dom'
import { blockText } from './field-dom'

/**
 * Каретка и геометрия поля ввода: где она стоит, что перед ней, какой кусок поля
 * выделен. Поле плоское: верхний уровень - текстовые узлы и чипы.
 */

/** Запас, чтобы строка с кареткой не липла к краю поля. */
const CARET_MARGIN_PX = 4

/** Самый узкий глиф - текст длиннее «строки из таких на порог» в меньше строк не влезет. */
const NARROWEST_CHARACTER_PX = 4

const selectionRange = (root: HTMLElement, collapsed = true): Range | null => {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0 || (collapsed && !selection.isCollapsed)) return null

  const range = selection.getRangeAt(0)

  return root.contains(range.startContainer) ? range : null
}

/**
 * Прямоугольник символа перед кареткой: свёрнутый диапазон в конце поля (каретка между
 * детьми, а не в тексте) Chromium не измеряет вовсе, и тогда меряем то, что стоит перед ней.
 */
const beforeCaret = (range: Range): DOMRect | null => {
  const { startContainer: node, startOffset: offset } = range

  if (node.nodeType === Node.TEXT_NODE && offset > 0) {
    const probe = document.createRange()

    probe.setStart(node, offset - 1)
    probe.setEnd(node, offset)

    return probe.getBoundingClientRect()
  }

  const previous = node.childNodes[offset - 1]

  if (previous instanceof Element) return previous.getBoundingClientRect()
  if (!(previous instanceof Text) || previous.length === 0) return null

  const probe = document.createRange()

  probe.setStart(previous, previous.length - 1)
  probe.setEnd(previous, previous.length)

  return probe.getBoundingClientRect()
}

/** Где каретка относительно origin - туда встаёт серый синтаксис аргумента. */
export const caretRect = (root: HTMLElement, origin: HTMLElement) => {
  const range = selectionRange(root)
  const own = range?.getBoundingClientRect()
  const before = range && !(own && own.height > 0) ? beforeCaret(range) : null
  const place =
    own && own.height > 0
      ? { left: own.left, top: own.top, height: own.height }
      : before && before.height > 0
        ? { left: before.right, top: before.top, height: before.height }
        : null

  if (!place) return null

  // Слой встаёт от края внутри рамки (так считает position: absolute), а прямоугольник - от
  // внешнего: без её толщины подсказка уезжала на пиксель вправо и вниз.
  const base = origin.getBoundingClientRect()

  return {
    left: place.left - base.left - origin.clientLeft,
    top: place.top - base.top - origin.clientTop,
    height: place.height,
  }
}

/**
 * Полоса строки с кареткой. На пустой строке Chromium прямоугольников не даёт - строка
 * меряется соседним символом: сначала после каретки, потом перед.
 */
const caretLine = (range: Range): { top: number; bottom: number } | null => {
  const own = range.getBoundingClientRect()

  if (own.height > 0) return own

  const node = range.startContainer
  const at = range.startOffset
  const length =
    node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '').length : node.childNodes.length

  for (const [from, to] of [
    [at, at + 1],
    [at - 1, at],
  ] as const) {
    if (from < 0 || to > length) continue

    const probe = document.createRange()

    probe.setStart(node, from)
    probe.setEnd(node, to)

    const box = probe.getBoundingClientRect()

    if (box.height > 0) return box
  }

  return null
}

/** На сколько прокрутить поле, чтобы строка с кареткой была видна целиком. */
export const caretScrollShift = (
  caret: { top: number; bottom: number },
  field: { top: number; bottom: number },
): number => {
  const below = caret.bottom - field.bottom

  if (below > 0) return below + CARET_MARGIN_PX

  const above = field.top - caret.top

  return above > 0 ? -(above + CARET_MARGIN_PX) : 0
}

/** Поле - к строке с кареткой; не измерилась - поле не трогаем: догадка стоит места письма. */
export const scrollCaretIntoView = (root: HTMLElement): void => {
  const range = selectionRange(root, false)
  const caret = range ? caretLine(range) : null

  if (caret) root.scrollTop += caretScrollShift(caret, root.getBoundingClientRect())
}

/** Чип, в который упрётся стрелка; в середине слова - null. */
export const chipBesideCaret = (
  root: HTMLElement,
  direction: 'backward' | 'forward',
  chipOf: ChipOf,
): HTMLElement | null => {
  const range = selectionRange(root)

  if (!range) return null

  const { startContainer, startOffset } = range
  const back = direction === 'backward'
  let node: Node | null | undefined = null

  if (startContainer.nodeType === Node.TEXT_NODE) {
    const length = (startContainer.textContent ?? '').length

    if (back ? startOffset > 0 : startOffset < length) return null

    node = back ? startContainer.previousSibling : startContainer.nextSibling
  } else if (startContainer === root) {
    node = root.childNodes[back ? startOffset - 1 : startOffset]
  }

  return node instanceof HTMLElement && chipOf(node) ? node : null
}

/** «@» под кареткой: в начале строки или после пробела; запрос и где он в узле. */
export const atQueryAt = (root: HTMLElement) => {
  const range = selectionRange(root)

  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null

  const node = range.startContainer as Text
  const match = /(?:^|\s)@([^\s@]*)$/.exec(node.data.slice(0, range.startOffset))

  if (!match) return null

  return {
    query: match[1] ?? '',
    node,
    start: match.index + (match[0].startsWith('@') ? 0 : 1),
    end: range.startOffset,
  }
}

/** Граница выделения в плоских координатах поля: какой ребёнок и сколько символов. */
const pointIn = (root: HTMLElement, container: Node, offset: number, side: 'start' | 'end') => {
  const children = Array.from(root.childNodes)

  if (container === root) return { index: Math.min(offset, children.length), offset: 0 }

  let node: Node | null = container

  while (node && node.parentNode !== root) node = node.parentNode

  const index = node ? children.indexOf(node as ChildNode) : -1

  if (index < 0) return { index: children.length, offset: 0 }
  if (node === container && container.nodeType === Node.TEXT_NODE) return { index, offset }

  // Чип неделим: граница внутри него прижимается к краю.
  return side === 'start' ? { index, offset: 0 } : { index: index + 1, offset: 0 }
}

/**
 * Текст поля от начала до каретки - из него читается команда. null - каретки в поле
 * нет или перед ней стоит вложение (тогда «/» уже не команда).
 */
export const headText = (root: HTMLElement, chipOf: ChipOf): string | null => {
  const range = selectionRange(root)

  if (!range) return null

  const { index, offset } = pointIn(root, range.startContainer, range.startOffset, 'start')
  const children = Array.from(root.childNodes)
  let head = ''

  for (const node of children.slice(0, index)) {
    if (chipOf(node)) return null

    head += node.textContent ?? ''
  }

  const current = children[index]

  if (current?.nodeType === Node.TEXT_NODE) head += (current.textContent ?? '').slice(0, offset)

  return head
}

/** Поле, разрезанное выделением: что внутри, что осталось и где встанет каретка. */
export const splitTokens = (root: HTMLElement, range: Range, chipOf: ChipOf) => {
  const start = pointIn(root, range.startContainer, range.startOffset, 'start')
  const end = pointIn(root, range.endContainer, range.endOffset, 'end')
  const picked: DraftToken[] = []
  const rest: DraftToken[] = []
  let caret = 0
  const keep = (token: DraftToken | null, before: boolean) => {
    if (token) rest.push(token)
    if (before) caret = rest.length
  }
  const asText = (value: string): DraftToken | null => (value ? { kind: 'text', value } : null)
  const asBlock = (value: string, into: DraftToken[]) =>
    asText(blockText(value, into.length > 0) ?? '')

  Array.from(root.childNodes).forEach((node, index) => {
    const chip = chipOf(node)

    if (chip || node.nodeType !== Node.TEXT_NODE) {
      const raw = node.textContent ?? ''
      const inside = index >= start.index && index < end.index

      if (inside) {
        const token: DraftToken | null = chip ? { kind: 'chip', chip } : asBlock(raw, picked)

        if (token) picked.push(token)
      } else {
        keep(chip ? { kind: 'chip', chip } : asBlock(raw, rest), index < start.index)
      }

      return
    }

    const value = node.textContent ?? ''

    if (index < start.index || index > end.index) return keep(asText(value), index < start.index)

    const from = index === start.index ? Math.min(start.offset, value.length) : 0
    const to = index === end.index ? Math.min(end.offset, value.length) : value.length
    const inside = asText(value.slice(from, to))

    if (inside) picked.push(inside)

    keep(asText(value.slice(0, from)), true)
    keep(asText(value.slice(to)), false)
  })

  return { picked, rest, caret }
}

/**
 * Сколько строк займёт текст в поле - видимых, а не записанных: стена текста одной
 * строкой без переносов в узком поле - это сорок строк. Меряется невидимой копией с
 * шрифтом и шириной поля; длинный текст отвечается без раскладки.
 */
export const wrappedLineCount = (field: HTMLElement, text: string, atLeast = 1): number => {
  const style = getComputedStyle(field)
  const width =
    field.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')

  if (!(width > 0) || text.length === 0) return 0

  if (text.length > Math.max(1, atLeast) * Math.ceil(width / NARROWEST_CHARACTER_PX)) {
    return Math.max(1, atLeast)
  }

  const ruler = document.createElement('div')

  Object.assign(ruler.style, {
    position: 'fixed',
    top: '-10000px',
    visibility: 'hidden',
    width: `${width}px`,
    font: style.font,
    letterSpacing: style.letterSpacing,
    whiteSpace: 'pre-wrap',
    overflowWrap: style.overflowWrap,
    wordBreak: style.wordBreak,
  })
  document.body.append(ruler)
  ruler.textContent = 'X'

  const line = ruler.getBoundingClientRect().height

  ruler.textContent = text

  const height = ruler.getBoundingClientRect().height

  ruler.remove()

  return line > 0 ? Math.max(1, Math.round(height / line)) : 0
}

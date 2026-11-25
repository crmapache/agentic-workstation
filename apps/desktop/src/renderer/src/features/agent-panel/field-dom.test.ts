// @vitest-environment happy-dom
import { it, expect, describe, afterEach } from 'vitest'

import {
  charAfter,
  charBefore,
  restoreCaret,
  needsLeadingSpace,
  needsTrailingSpace,
} from './field-dom'

/** Поле из узлов: строки - текстом, null - чипом (элемент, не текст). */
const fieldOf = (...parts: (string | null)[]): HTMLElement => {
  const root = document.createElement('div')

  for (const part of parts) {
    root.append(part === null ? document.createElement('span') : document.createTextNode(part))
  }

  return root
}

const caretAt = (container: Node, offset: number): Range => {
  const range = document.createRange()

  range.setStart(container, offset)
  range.collapse(true)

  return range
}

describe('пробелы вокруг вложения - как в ACC', () => {
  it('после вложения пробел всегда, кроме уже стоящего пробела', () => {
    expect(needsTrailingSpace('')).toBe(true)
    expect(needsTrailingSpace('a')).toBe(true)
    // Перевод строки - не место для каретки: следующая буква липла к картинке.
    expect(needsTrailingSpace('\n')).toBe(true)
    expect(needsTrailingSpace(' ')).toBe(false)
    expect(needsTrailingSpace('\t')).toBe(false)
  })

  it('перед вложением - только если там буква', () => {
    expect(needsLeadingSpace('')).toBe(false)
    expect(needsLeadingSpace('\n')).toBe(false)
    expect(needsLeadingSpace('a')).toBe(true)
  })

  it('символы рядом видны и через край текстового узла', () => {
    const root = fieldOf('abc', 'def')
    const first = root.firstChild
    const second = root.lastChild

    if (!first || !second) throw new Error('no text nodes')

    expect(charAfter(caretAt(first, 3))).toBe('d')
    expect(charBefore(caretAt(second, 0))).toBe('c')
  })

  it('между узлами: рядом чип или край поля - пусто', () => {
    const root = fieldOf('abc', null, ' x')

    expect(charBefore(caretAt(root, 1))).toBe('c')
    expect(charAfter(caretAt(root, 1))).toBe('')
    expect(charAfter(caretAt(root, 2))).toBe(' ')
    expect(charAfter(caretAt(root, 3))).toBe('')
  })
})

describe('фокус без каретки - каретка на место, а не в начало поля', () => {
  /** Поле на странице: выделение работает только в документе. */
  const mounted = (...parts: (string | null)[]) => {
    const root = fieldOf(...parts)

    document.body.append(root)

    return root
  }

  const select = (range: Range) => {
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
  }

  /** Где каретка: узел и смещение. */
  const caret = () => {
    const range = window.getSelection()?.getRangeAt(0)

    return { node: range?.startContainer, offset: range?.startOffset, collapsed: range?.collapsed }
  }

  afterEach(() => {
    window.getSelection()?.removeAllRanges()
    document.body.replaceChildren()
  })

  it('каретка ушла из поля - туда, где её оставили', () => {
    const root = mounted('Давай еще раз')
    const outside = mounted('лента')
    const text = root.firstChild

    if (!text || !outside.firstChild) throw new Error('no text nodes')

    const kept = caretAt(text, 5)

    select(caretAt(outside.firstChild, 2))
    restoreCaret(root, kept)

    expect(caret()).toEqual({ node: text, offset: 5, collapsed: true })
  })

  it('оставленное выделение - сворачивается к концу, набор его не сотрёт', () => {
    const root = mounted('Давай еще раз')
    const text = root.firstChild

    if (!text) throw new Error('no text node')

    const kept = caretAt(text, 2)

    kept.setEnd(text, 9)
    window.getSelection()?.removeAllRanges()
    restoreCaret(root, kept)

    expect(caret()).toEqual({ node: text, offset: 9, collapsed: true })
  })

  it('каретку не оставляли или её узла уже нет - в конец набранного', () => {
    const root = mounted('abc', null, 'def')
    const gone = document.createTextNode('old')

    window.getSelection()?.removeAllRanges()
    restoreCaret(root, null)

    expect(caret()).toEqual({ node: root, offset: 3, collapsed: true })

    window.getSelection()?.removeAllRanges()
    restoreCaret(root, caretAt(gone, 1))

    expect(caret()).toEqual({ node: root, offset: 3, collapsed: true })
  })

  it('Chromium поставил каретку в начало при фокусе - туда, где её оставили', () => {
    const root = mounted('abcdef')
    const text = root.firstChild

    if (!text) throw new Error('no text node')

    select(caretAt(root, 0))
    restoreCaret(root, caretAt(text, 4))

    expect(caret()).toEqual({ node: text, offset: 4, collapsed: true })
  })

  it('в начале её и оставили или там выделение - не трогается', () => {
    const root = mounted('abcdef')
    const text = root.firstChild

    if (!text) throw new Error('no text node')

    select(caretAt(text, 0))
    restoreCaret(root, caretAt(root, 0))

    expect(caret()).toEqual({ node: text, offset: 0, collapsed: true })

    const picked = caretAt(text, 0)

    picked.setEnd(text, 3)
    select(picked)
    restoreCaret(root, caretAt(text, 5))

    expect(caret()).toEqual({ node: text, offset: 0, collapsed: false })
  })

  it('каретка уже в поле - не трогается', () => {
    const root = mounted('abcdef')
    const text = root.firstChild

    if (!text) throw new Error('no text node')

    select(caretAt(text, 1))
    restoreCaret(root, caretAt(text, 4))

    expect(caret()).toEqual({ node: text, offset: 1, collapsed: true })
  })
})

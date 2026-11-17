// @vitest-environment happy-dom
import { it, expect, describe } from 'vitest'

import { charAfter, charBefore, needsLeadingSpace, needsTrailingSpace } from './field-dom'

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

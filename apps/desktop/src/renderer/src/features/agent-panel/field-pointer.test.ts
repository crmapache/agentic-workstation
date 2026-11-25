// @vitest-environment happy-dom
import { it, vi, expect, describe, afterEach } from 'vitest'

import { caretAboveFirstLine } from './field-pointer'

/** Поле, которое Chromium нарисовал бы так: рамка сверху на 100, отступ 12, строка 20. */
const TOP = 100
const PADDING = 12
const LINE = 20

const fieldOf = (...parts: (string | null)[]): HTMLElement => {
  const root = document.createElement('div')

  root.style.paddingTop = `${PADDING}px`
  root.style.lineHeight = `${LINE}px`

  for (const part of parts) {
    root.append(part === null ? document.createElement('span') : document.createTextNode(part))
  }

  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, TOP, 400, 60))
  document.body.append(root)

  return root
}

/** Что ответил бы Chromium на «где каретка под точкой» - и с какими координатами спросили. */
const pointAt = (node: Node, offset: number) => {
  const ask = vi.fn(() => ({ offsetNode: node, offset }) as CaretPosition)

  Object.defineProperty(document, 'caretPositionFromPoint', { value: ask, configurable: true })

  return ask
}

const notChip = () => undefined

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('нажатие выше первой строки - на первую строку, а не в начало текста', () => {
  it('в верхнем отступе - место на первой строке под курсором', () => {
    const root = fieldOf('Давай еще раз попробую')
    const text = root.firstChild

    if (!text) throw new Error('no text node')

    const ask = pointAt(text, 22)
    const caret = caretAboveFirstLine(root, 350, TOP + 5, notChip)

    // Спрашивается середина первой строки, по горизонтали - там, где нажали.
    expect(ask).toHaveBeenCalledWith(350, TOP + PADDING + LINE / 2)
    expect(caret?.startContainer).toBe(text)
    expect(caret?.startOffset).toBe(22)
    expect(caret?.collapsed).toBe(true)
  })

  it('на строке и ниже - решает браузер', () => {
    const root = fieldOf('abc')
    const ask = pointAt(root, 0)

    expect(caretAboveFirstLine(root, 350, TOP + PADDING, notChip)).toBeNull()
    expect(caretAboveFirstLine(root, 350, TOP + 50, notChip)).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it('поле прокручено за отступ - сверху уже строка, а не отступ', () => {
    const root = fieldOf('abc')
    const ask = pointAt(root, 0)

    root.scrollTop = PADDING

    expect(caretAboveFirstLine(root, 350, TOP + 2, notChip)).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it('пустое поле - браузеру: начало там же, где конец', () => {
    const root = fieldOf()

    pointAt(root, 0)

    expect(caretAboveFirstLine(root, 350, TOP + 2, notChip)).toBeNull()
  })

  it('над чипом - с ближней стороны чипа, а не внутрь подписи', () => {
    const root = fieldOf('a ', null, ' b')
    const chip = root.childNodes[1]

    if (!(chip instanceof HTMLElement)) throw new Error('no chip')

    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 112, 80, 20))
    chip.append(document.createTextNode('README.md'))

    const label = chip.firstChild

    if (!label) throw new Error('no label')

    pointAt(label, 3)

    const isChip = (node: Node) =>
      node === chip ? { kind: 'file' as const, value: 'x' } : undefined
    const before = caretAboveFirstLine(root, 120, TOP + 2, isChip)
    const after = caretAboveFirstLine(root, 170, TOP + 2, isChip)

    expect([before?.startContainer, before?.startOffset]).toEqual([root, 1])
    expect([after?.startContainer, after?.startOffset]).toEqual([root, 2])
  })
})

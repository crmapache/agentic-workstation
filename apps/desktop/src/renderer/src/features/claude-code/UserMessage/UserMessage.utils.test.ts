// @vitest-environment happy-dom
import { it, expect, describe } from 'vitest'

import type { DraftToken } from '@shared/claude-draft'

import { pickedTokens, splitParagraphs } from './UserMessage.utils'

describe('splitParagraphs', () => {
  it('режет по пустой строке, одиночный перенос оставляет в абзаце', () => {
    expect(splitParagraphs('one\ntwo\n\nthree')).toEqual(['one\ntwo', 'three'])
  })

  it('несколько пустых строк подряд и строки из пробелов - одна граница', () => {
    expect(splitParagraphs('one\n\n\n  \t\ntwo')).toEqual(['one', 'two'])
  })

  it('пустая строка на краю куска даёт пустой абзац - зазор встаёт у соседнего чипа', () => {
    expect(splitParagraphs('\n\nafter chip')).toEqual(['', 'after chip'])
    expect(splitParagraphs('before chip\n\n')).toEqual(['before chip', ''])
  })

  it('текст без пустых строк - один абзац', () => {
    expect(splitParagraphs('just one line')).toEqual(['just one line'])
  })
})

describe('pickedTokens', () => {
  const COMMAND: DraftToken = { kind: 'chip', chip: { kind: 'cmd', value: 'compact' } }
  const TOKENS: DraftToken[] = [
    { kind: 'text', value: 'run ' },
    COMMAND,
    { kind: 'text', value: ' now\n\nnext' },
  ]

  /** Тело сообщения, как его рисует MessageBody: чип в метке куска, зазор абзацев - пустым узлом. */
  const messageBody = () => {
    const root = document.createElement('div')

    root.innerHTML =
      'run <span data-message-token="1"><span><svg></svg><span>/compact</span>' +
      '<span popover>Compact the conversation</span></span></span> now' +
      '<span data-paragraph-break></span>next'
    document.body.replaceChildren(root)

    return root
  }

  const textNodes = (root: HTMLElement) =>
    [...root.childNodes].filter((node): node is Text => node instanceof Text)

  it('выделено всё - набранное, чип целиком и пустая строка на месте зазора', () => {
    const root = messageBody()
    const range = document.createRange()

    range.selectNodeContents(root)

    expect(pickedTokens(root, range, TOKENS)).toEqual(TOKENS)
  })

  it('выделение с середины слова - набранное в его границах, задетый чип - целиком', () => {
    const root = messageBody()
    const [run, now] = textNodes(root)
    const range = document.createRange()

    range.setStart(run!, 1)
    range.setEnd(now!, 2)

    expect(pickedTokens(root, range, TOKENS)).toEqual([
      { kind: 'text', value: 'un ' },
      COMMAND,
      { kind: 'text', value: ' n' },
    ])
  })

  it('без чипов, внутри одного вложения или за краем сообщения - копирует браузер', () => {
    const root = messageBody()
    const [run, now] = textNodes(root)
    const inside = root.querySelector('[data-message-token] span span')!.firstChild!
    const outside = document.createElement('p')
    const range = document.createRange()

    range.setStart(now!, 0)
    range.setEnd(now!, 3)
    expect(pickedTokens(root, range, TOKENS)).toBeNull()

    range.setStart(inside, 1)
    range.setEnd(inside, 4)
    expect(pickedTokens(root, range, TOKENS)).toBeNull()

    document.body.append(outside)
    range.setStart(run!, 0)
    range.setEnd(outside, 0)
    expect(pickedTokens(root, range, TOKENS)).toBeNull()
  })
})

// @vitest-environment happy-dom
import { it, expect, describe } from 'vitest'

import { quoteRange } from './feed-text'

/** Ответ, как его рисует лента: абзацы, выделенное жирным, скрытый исходник формулы. */
const answer = (): HTMLElement => {
  const root = document.createElement('div')

  root.innerHTML = [
    '<p>First paragraph about caches.</p>',
    '<p>The cache line holds <strong>sixty four</strong> bytes.</p>',
    '<p>Next one <span aria-hidden="true">hidden source</span>here.</p>',
  ].join('')

  return root
}

describe('место цитаты в строке', () => {
  it('слова через разметку и переносы абзацев, без учёта регистра', () => {
    const root = answer()

    expect(quoteRange(root, 'cache line holds sixty four')?.toString()).toBe(
      'cache line holds sixty four',
    )
    expect(quoteRange(root, 'About caches.\nThe CACHE')?.toString()).toBe('about caches.The cache')
  })

  it('выделение, ушедшее в следующую строку, - по своей первой строке; чужое - null', () => {
    const root = answer()

    expect(quoteRange(root, 'sixty four bytes.\nYOU 17:26 why?')?.toString()).toBe(
      'sixty four bytes.',
    )
    expect(quoteRange(root, 'hidden source')).toBeNull()
    expect(quoteRange(root, '   ')).toBeNull()
  })
})

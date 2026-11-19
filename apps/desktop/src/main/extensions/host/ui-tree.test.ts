import { it, expect, describe } from 'vitest'

import { parseTheme, parseUiTree } from './ui-tree'

describe('parseUiTree', () => {
  it('пропускает известное дерево', () => {
    const tree = {
      type: 'section',
      title: 'Counter',
      actions: [{ type: 'button', label: 'Reset', action: 'reset', variant: 'ghost' }],
      children: [
        { type: 'text', text: 'Hello', tone: 'muted' },
        { type: 'textField', name: 'query', label: 'Query' },
        {
          type: 'list',
          items: [{ id: '1', title: 'One', badge: { text: 'new', tone: 'accent' } }],
        },
      ],
    }

    expect(parseUiTree(tree)).toEqual(tree)
    expect(parseUiTree(null)).toBeNull()
  })

  it('отказывает: незнакомый узел, лишняя глубина, HTML в имени действия', () => {
    expect(() => parseUiTree({ type: 'html', html: '<script>' })).toThrow(/View tree/)
    expect(() => parseUiTree({ type: 'button', label: 'x', action: '<img onerror>' })).toThrow()

    let deep: unknown = { type: 'divider' }

    for (let level = 0; level < 30; level += 1) deep = { type: 'stack', children: [deep] }

    expect(() => parseUiTree(deep)).toThrow(/deeper/)
  })
})

describe('parseTheme', () => {
  it('берёт цвета, палитру и шрифты', () => {
    expect(
      parseTheme({ '--color-accent': '#ff8800', '--palette-graphite-900': 'oklch(20% 0 0)' }),
    ).toEqual({
      '--color-accent': '#ff8800',
      '--palette-graphite-900': 'oklch(20% 0 0)',
    })
    expect(parseTheme(null)).toBeNull()
  })

  it('не пускает чужие токены, загрузку извне и выход из объявления', () => {
    expect(() => parseTheme({ '--space-4': '0' })).toThrow(/not allowed/)
    expect(() => parseTheme({ '--color-bg': 'url(https://evil.example/x.png)' })).toThrow()
    expect(() => parseTheme({ '--color-bg': 'red; } body { display: none' })).toThrow()
  })
})

import { it, expect, describe } from 'vitest'

import { readFence, findFenceStart } from './markdown-fences.utils'

describe('readFence', () => {
  // Инфо-строка - вся, а не первое слово: «markdown ultracode» называет режим промпта.
  it('opens a block on an info string of several words and keeps it whole', () => {
    expect(readFence(['```markdown ultracode', '# A heading', '```'].join('\n'))).toEqual({
      raw: ['```markdown ultracode', '# A heading', '```'].join('\n'),
      info: 'markdown ultracode',
      text: '# A heading',
      closed: true,
    })
  })

  it('lets a four-backtick block hold a three-backtick one', () => {
    const block = readFence(
      [
        '````markdown',
        'Report in this shape:',
        '```',
        '# Audit',
        '```',
        '````',
        'and that is all',
      ].join('\n'),
    )

    expect(block?.info).toBe('markdown')
    expect(block?.text).toBe(['Report in this shape:', '```', '# Audit', '```'].join('\n'))
    expect(block?.raw.endsWith('````')).toBe(true)
  })

  // Замерено на живом ответе: пример с пятью бэктиками внутри обычного блока по
  // CommonMark закрывал блок, и вторая половина съедала весь хвост ответа.
  it('does not let a longer fence close a block', () => {
    const block = readFence(['```', '`````', 'plain text', '`````', '```', 'the rest'].join('\n'))

    expect(block?.text).toBe(['`````', 'plain text', '`````'].join('\n'))
    expect(block?.closed).toBe(true)
  })

  it('does not let a fence with an info string close a block', () => {
    const block = readFence(['````', 'the shape:', '```json', '{}', '```', '````'].join('\n'))

    expect(block?.text).toBe(['the shape:', '```json', '{}', '```'].join('\n'))
  })

  it('keeps an unfinished block a block', () => {
    expect(readFence(['```ts', 'const a = 1'].join('\n'))).toEqual({
      raw: ['```ts', 'const a = 1'].join('\n'),
      info: 'ts',
      text: 'const a = 1',
      closed: false,
    })
    expect(readFence('```ts')).toEqual({ raw: '```ts', info: 'ts', text: '', closed: false })
  })

  it('reads an indented fence as a fence and strips its indent from the code', () => {
    const block = readFence(['    ```bash', '    pnpm test', '      --watch', '    ```'].join('\n'))

    expect(block?.info).toBe('bash')
    expect(block?.text).toBe(['pnpm test', '  --watch'].join('\n'))
    expect(block?.closed).toBe(true)
  })

  it('allows spaces after a closing fence', () => {
    expect(readFence(['```', 'a', '```   ', 'b'].join('\n'))?.raw).toBe(
      ['```', 'a', '```   '].join('\n'),
    )
  })

  it('reads nothing but a fence', () => {
    expect(readFence('text ```')).toBeNull()
    expect(readFence('``not a fence``')).toBeNull()
    expect(readFence('```js `x`')).toBeNull()
  })
})

describe('findFenceStart', () => {
  it('finds the line a fence starts on, not the first line', () => {
    const source = ['ext', '    ```bash', 'x'].join('\n')

    expect(findFenceStart(source)).toBe(source.indexOf('    ```'))
    expect(findFenceStart('```ts')).toBeUndefined()
    expect(findFenceStart('no fence `here`')).toBeUndefined()
  })
})

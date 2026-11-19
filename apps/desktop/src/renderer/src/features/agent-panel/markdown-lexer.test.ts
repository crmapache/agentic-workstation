import type { Token, Tokens } from 'marked'
import { it, expect, describe } from 'vitest'

import { lexMarkdown } from './markdown-lexer'

/** Блоки без пустых строк между ними. */
const blocks = (text: string) => lexMarkdown(text).filter((token) => token.type !== 'space')

/**
 * Куски строки в читаемом виде: текст как есть, код в бэктиках, жирный в звёздочках,
 * формула - `{math:…}`. Соседние куски текста склеены, как их видит глаз.
 */
const describeInline = (tokens: readonly Token[]): string[] =>
  tokens.reduce<string[]>((parts, token) => {
    const piece =
      token.type === 'math'
        ? `{math:${String(token['text'])}}`
        : token.type === 'codespan'
          ? `\`${(token as Tokens.Codespan).text}\``
          : token.type === 'strong'
            ? `**${describeInline((token as Tokens.Strong).tokens).join('')}**`
            : null

    if (piece) return [...parts, piece]

    const text = 'text' in token && typeof token.text === 'string' ? token.text : token.raw
    const last = parts.at(-1)

    return last !== undefined && !last.startsWith('{math:') && !/^[`*]/.test(last)
      ? [...parts.slice(0, -1), last + text]
      : [...parts, text]
  }, [])

const inline = (text: string) => describeInline((blocks(text)[0] as Tokens.Paragraph).tokens)

describe('lexMarkdown: code fences', () => {
  it('lets a four-backtick block hold a three-backtick one and leaves the prose after it prose', () => {
    const tokens = blocks(
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

    expect(tokens.map((token) => token.type)).toEqual(['code', 'paragraph'])
    expect((tokens[0] as Tokens.Code).lang).toBe('markdown')
    expect((tokens[0] as Tokens.Code).text).toBe(
      ['Report in this shape:', '```', '# Audit', '```'].join('\n'),
    )
  })

  it('leaves headings and bold after a block with a longer fence inside it as prose', () => {
    const tokens = blocks(
      [
        '```',
        '`````',
        'plain text',
        '`````',
        '```',
        '',
        '## What is left',
        '',
        '**Speed:** not measured',
      ].join('\n'),
    )

    expect(tokens.map((token) => token.type)).toEqual(['code', 'heading', 'paragraph'])
    expect((tokens[2] as Tokens.Paragraph).tokens[0]?.type).toBe('strong')
  })

  it('keeps the whole info string on the token', () => {
    expect(
      (blocks(['```markdown ultracode', '# Audit', '```'].join('\n'))[0] as Tokens.Code).lang,
    ).toBe('markdown ultracode')
  })

  // Ответ приходит по букве, и разбирается каждый его префикс: вложенный забор не
  // должен закрыть блок ни на одном, иначе лента перекраивается на ходу.
  it('holds the block through every prefix of a streaming answer', () => {
    const answer = [
      '````markdown ultracode',
      '# Audit',
      '',
      'In this shape:',
      '```',
      '## Findings',
      '```',
      '',
      'Sort them.',
      '````',
    ].join('\n')

    for (let length = answer.indexOf('\n') + 1; length <= answer.length; length += 1) {
      const tokens = blocks(answer.slice(0, length))

      expect(tokens[0]?.type, `at ${length} characters`).toBe('code')
      expect(
        tokens.some((token) => token.type === 'heading'),
        `at ${length} characters`,
      ).toBe(false)
    }
  })

  it('reads an indented fence as a fence, even right under a paragraph', () => {
    const tokens = blocks(['Run:', '    ```bash', '    pnpm test', '    ```'].join('\n'))

    expect(tokens.map((token) => token.type)).toEqual(['paragraph', 'code'])
    expect((tokens[1] as Tokens.Code).text).toBe('pnpm test')
  })

  it('reads a fence inside a list item', () => {
    const [list] = blocks(['1. Run:', '   ```bash', '   pnpm test', '   ```', '2. Done'].join('\n'))
    const items = (list as Tokens.List).items

    expect(items).toHaveLength(2)
    expect(items[0]?.tokens.map((token) => token.type)).toContain('code')
  })

  it('still reads tables and lists', () => {
    const tokens = blocks(
      ['| a | b |', '|:---|---:|', '| 1 | 2 |', '', '- one', '- two'].join('\n'),
    )

    expect(tokens.map((token) => token.type)).toEqual(['table', 'list'])
    expect((tokens[0] as Tokens.Table).align).toEqual(['left', 'right'])
  })
})

describe('lexMarkdown: formulas standing on their own', () => {
  it('reads one written over three lines, on one line and with TeX brackets', () => {
    expect(blocks(['Then:', '', '$$', 'E = mc^2', '$$'].join('\n'))[1]).toMatchObject({
      type: 'math',
      text: 'E = mc^2',
      display: true,
    })
    expect(blocks('$$E = mc^2$$')[0]).toMatchObject({ type: 'math', text: 'E = mc^2' })
    expect(blocks(['\\[', 'a^2 + b^2 = c^2', '\\]'].join('\n'))[0]).toMatchObject({
      type: 'math',
      text: 'a^2 + b^2 = c^2',
    })
  })

  it('cuts the paragraph above a formula', () => {
    expect(blocks(['Then:', '$$', 'x', '$$'].join('\n')).map((token) => token.type)).toEqual([
      'paragraph',
      'math',
    ])
  })

  // Формула существует только закрытой: пока она печатается, это текст.
  it('leaves an unfinished formula as text in the same paragraph', () => {
    const tokens = blocks(['Then:', '$$', '\\frac{a}{b'].join('\n'))

    expect(tokens.map((token) => token.type)).toEqual(['paragraph'])
  })

  it('does not look for the closing delimiter past a blank line or into a code block', () => {
    expect(
      blocks(['$$', 'a = b', '', 'Never mind.', '$$'].join('\n')).map((token) => token.type),
    ).toEqual(['paragraph', 'paragraph'])
    expect(
      blocks(['$$', '```ts', 'const a = 1', '```'].join('\n')).map((token) => token.type),
    ).toEqual(['paragraph', 'code'])
  })

  it('leaves a dollar pair inside a code block alone', () => {
    expect(blocks(['```ts', 'const s = `$${cost}`', '```'].join('\n'))[0]).toMatchObject({
      type: 'code',
      text: 'const s = `$${cost}`',
    })
  })

  it('does not merge two formulas written on the same line into one', () => {
    expect(inline('$$a^2$$ and $$b^2$$')).toEqual(['$', '{math:a^2}', '$ and $', '{math:b^2}', '$'])
  })
})

describe('lexMarkdown: formulas inside a line', () => {
  it('reads formulas between dollars and the TeX way', () => {
    expect(inline('so $E = mc^2$ follows')).toEqual(['so ', '{math:E = mc^2}', ' follows'])
    expect(inline('so \\(a^2 + b^2\\) follows')).toEqual(['so ', '{math:a^2 + b^2}', ' follows'])
    expect(inline('written as a\\(x\\)b in the file')).toEqual([
      'written as a',
      '{math:x}',
      'b in the file',
    ])
    expect(inline('$x$ and $y$')).toEqual(['{math:x}', ' and ', '{math:y}'])
    expect(inline('$x$$y$')).toEqual(['{math:x}', '{math:y}'])
    expect(inline('so $a*b*c$ follows')).toEqual(['so ', '{math:a*b*c}', ' follows'])
    expect(inline('for ($x$), then')).toEqual(['for (', '{math:x}', '), then'])
  })

  // Доллар в ответе про код - цена, переменная оболочки, шаблонная строка.
  it('leaves prices, shell variables and template literals alone', () => {
    expect(inline('it costs $5 and $10 a month')).toEqual(['it costs $5 and $10 a month'])
    expect(inline('$5$10')).toEqual(['$5$10'])
    expect(inline('read $HOME and $PATH')).toEqual(['read $HOME and $PATH'])
    expect(inline('written as $${cost} in the string')).toEqual([
      'written as $${cost} in the string',
    ])
    expect(inline('written as a$b$c in the file')).toEqual(['written as a$b$c in the file'])
    expect(inline('written as \u{1d54f}$b$c in the file')).toEqual([
      'written as \u{1d54f}$b$c in the file',
    ])
    expect(inline('written as a$b$\u{1d54f} in the file')).toEqual([
      'written as a$b$\u{1d54f} in the file',
    ])
    expect(inline(`$${'x'.repeat(2001)}$`)).toEqual([`$${'x'.repeat(2001)}$`])
  })

  it('leaves a dollar inside backticks to the code span', () => {
    expect(inline('run `echo $PATH` first')).toEqual(['run ', '`echo $PATH`', ' first'])
    expect(inline('the retry $10, `$HOME` and $PATH are read the same')).toEqual([
      'the retry $10, ',
      '`$HOME`',
      ' and $PATH are read the same',
    ])
  })

  it('leaves code or bold alone when nothing but punctuation sits against the dollars', () => {
    expect(inline('cost $10,`config`$ done')).toEqual(['cost $10,', '`config`', '$ done'])
    expect(inline('cost $10,**config**$ done')).toEqual(['cost $10,', '**config**', '$ done'])
  })

  it('keeps an escaped dollar inside a formula together with the rest of it', () => {
    expect(inline('it is $\\text{costs } \\$5$ a month')).toEqual([
      'it is ',
      '{math:\\text{costs } \\$5}',
      ' a month',
    ])
    expect(inline('it is $\\$5 \\text{today}$ a month')).toEqual([
      'it is ',
      '{math:\\$5 \\text{today}}',
      ' a month',
    ])
    expect(inline('it is $\\$$ a month')).toEqual(['it is ', '{math:\\$}', ' a month'])
  })

  it('reads a formula inside a table cell', () => {
    const [table] = blocks(
      ['| name | formula |', '|---|---|', '| energy | $E = mc^2$ |'].join('\n'),
    )

    expect(describeInline((table as Tokens.Table).rows[0]?.[1]?.tokens ?? [])).toEqual([
      '{math:E = mc^2}',
    ])
  })
})

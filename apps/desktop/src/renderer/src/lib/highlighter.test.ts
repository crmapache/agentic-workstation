import { it, expect, describe } from 'vitest'

import { highlightCode, createLineHighlighter } from './highlighter'

describe('createLineHighlighter', () => {
  it('строка за строкой, роли - те же, что у блоков кода', async () => {
    const lines = await createLineHighlighter('typescript')

    expect(lines).not.toBeNull()

    // Первая строка собирает выражения грамматики: под нагрузкой полного прогона она не
    // успевает за предел строки и остаётся недокрашенной. Тест - про роли, а не про время.
    lines!.tokenizeLine('const warm = 1', lines!.initial)

    const first = lines!.tokenizeLine('const answer = 42 // ok', lines!.initial)
    const roles = first.tokens.map((token) => token.role)

    expect(first.tokens[0]).toMatchObject({ start: 0, role: 'token-keyword' })
    expect(roles).toContain('token-constant')
    expect(roles).toContain('token-comment')

    // Незакрытый комментарий тянется на следующую строку через стек правил.
    const open = lines!.tokenizeLine('/* начало', lines!.initial)
    const next = lines!.tokenizeLine('конец */ const', open.state)

    expect(next.tokens[0]?.role).toBe('token-comment')
    expect(next.tokens.at(-1)?.role).toBe('token-keyword')
  })

  it('dotenv: ключ, значение и комментарий', async () => {
    const lines = await createLineHighlighter('dotenv')
    const roles = (line: string) =>
      lines!.tokenizeLine(line, lines!.initial).tokens.map((token) => token.role)

    expect(roles('# секрет')).toEqual(['token-comment'])
    expect(roles('API_URL="https://x"')).toContain('token-string-expression')
  })

  it('неизвестный язык - null', async () => {
    expect(await createLineHighlighter('brainfuck')).toBeNull()
    expect(await highlightCode('x', 'brainfuck')).toBeNull()
  })
})

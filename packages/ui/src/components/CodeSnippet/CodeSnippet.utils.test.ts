import { it, expect, describe } from 'vitest'

import { splitWords } from './CodeSnippet.utils'

describe('splitWords', () => {
  it('слова и пробелы по порядку, склеиваются в ту же строку', () => {
    const code = 'npx -y  @playwright/mcp --isolated'

    expect(splitWords(code)).toEqual(['npx', ' ', '-y', '  ', '@playwright/mcp', ' ', '--isolated'])
    expect(splitWords(code).join('')).toBe(code)
  })

  it('пустая строка - пусто', () => {
    expect(splitWords('')).toEqual([])
  })
})

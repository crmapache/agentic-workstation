import { it, expect, describe } from 'vitest'

import { agentLink } from './agent-links'

describe('agentLink', () => {
  it('открывает Cowork в Claude с текстом в q', () => {
    expect(agentLink('claude', 'Set up')).toBe('claude://cowork/new?q=Set%20up')
  })

  it('открывает новый чат в Codex с текстом в prompt', () => {
    expect(agentLink('codex', 'Set up')).toBe('codex://threads/new?prompt=Set%20up')
  })

  it('кодирует переводы строк, кавычки и & - текст не ломает ссылку', () => {
    const link = agentLink('claude', 'a & b\n"c"?#d')

    expect(link).toBe('claude://cowork/new?q=a%20%26%20b%0A%22c%22%3F%23d')
    expect(new URL(link).searchParams.get('q')).toBe('a & b\n"c"?#d')
  })
})

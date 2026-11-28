import { it, expect, describe } from 'vitest'

import { asQuestion, WALKTHROUGH_TOOLS } from './walkthrough-tools'

describe('walkthrough tools (ADR 0135)', () => {
  // Синтез произносит вопрос вопросом только со знаком вопроса в конце (замер 2026-11-26).
  it('ends every question with a question mark', () => {
    expect(asQuestion('Понятно')).toBe('Понятно?')
    expect(asQuestion('  Отправляем письмо.  ')).toBe('Отправляем письмо?')
    expect(asQuestion('Is it clear?')).toBe('Is it clear?')
    expect(asQuestion('わかりますか？')).toBe('わかりますか？')
  })

  it('highlights instead of the marker, and every highlight has its words', () => {
    const names = WALKTHROUGH_TOOLS.map((tool) => tool.name)

    expect(names).toEqual(['highlight', 'clear', 'ask', 'wait_for_user', 'user_marks', 'finish'])
    expect(WALKTHROUGH_TOOLS[0]?.inputSchema['required']).toContain('say')
    expect(WALKTHROUGH_TOOLS.every((tool) => tool.access === 'read')).toBe(true)
  })
})

import { it, expect, describe } from 'vitest'

import { failureCodeOf } from './acp-failures'

describe('сбой хода ACP', () => {
  it('отказ Google по условиям - своей строкой', () => {
    expect(failureCodeOf('Internal error: 403 TOS_VIOLATION: this account is blocked')).toBe(
      'terms-blocked',
    )
  })

  it('кончившаяся квота - своей строкой', () => {
    expect(failureCodeOf('You have exhausted your quota on this model.')).toBe('quota-exhausted')
    expect(failureCodeOf('Internal error: 429 RESOURCE_EXHAUSTED')).toBe('quota-exhausted')
  })

  it('прочее - ошибка CLI как есть', () => {
    expect(failureCodeOf('ACP agent exited')).toBe('cli-error')
    // Число в тексте - не код ответа.
    expect(failureCodeOf('Failed after 4290 ms')).toBe('cli-error')
  })
})

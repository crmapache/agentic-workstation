import { it, expect, describe } from 'vitest'

import { isSessionOf } from './session-place'

describe('сессия OpenCode этого проекта', () => {
  it('своя папка - да, чужая или без папки - нет', () => {
    expect(isSessionOf({ location: { directory: '/p/a/' } }, '/p/a')).toBe(true)
    expect(isSessionOf({ location: { directory: '/p/b' } }, '/p/a')).toBe(false)
    expect(isSessionOf({ id: 'ses_1' }, '/p/a')).toBe(false)
    expect(isSessionOf(null, '/p/a')).toBe(false)
  })
})

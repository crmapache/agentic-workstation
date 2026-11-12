import { it, expect, describe } from 'vitest'

import { hasWork, factLines } from './WorktreeRemoveDialog.utils'

describe('что теряется с worktree', () => {
  it('папки нет - одна строка, остальное не читается', () => {
    expect(factLines({ exists: false, dirty: true, commitsAhead: 3 })).toEqual([
      { kind: 'missing' },
    ])
  })

  it('свои коммиты и правки - обе строки', () => {
    expect(factLines({ exists: true, dirty: true, commitsAhead: 2 })).toEqual([
      { kind: 'ahead', count: 2 },
      { kind: 'dirty' },
    ])
  })

  it('терять нечего', () => {
    expect(factLines({ exists: true, dirty: false, commitsAhead: 0 })).toEqual([{ kind: 'clean' }])
  })

  it('работа в worktree - коммиты или правки в существующей папке', () => {
    expect(hasWork({ exists: true, dirty: false, commitsAhead: 1 })).toBe(true)
    expect(hasWork({ exists: true, dirty: true, commitsAhead: 0 })).toBe(true)
    expect(hasWork({ exists: true, dirty: false, commitsAhead: 0 })).toBe(false)
    expect(hasWork({ exists: false, dirty: true, commitsAhead: 1 })).toBe(false)
  })
})

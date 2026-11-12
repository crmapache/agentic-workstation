import { it, expect, describe } from 'vitest'

import type { ProjectCall } from './ProjectTab.types'
import { tabHint, callDots } from './ProjectTab.utils'

const call = (id: string): ProjectCall => ({
  id,
  tone: 'success',
  at: 0,
  text: `chat ${id}: done`,
})

describe('точки зова на вкладке проекта', () => {
  it('до трёх - все, больше - три новых и число старых', () => {
    expect(callDots([call('a'), call('b')])).toEqual({ shown: [call('a'), call('b')], hidden: 0 })
    expect(callDots(['a', 'b', 'c', 'd', 'e'].map(call))).toEqual({
      shown: [call('c'), call('d'), call('e')],
      hidden: 2,
    })
  })

  it('подсказка - путь и под ним каждый позвавший разговор', () => {
    expect(tabHint('~/p', [])).toBe('~/p')
    expect(tabHint('~/p', [call('a'), call('b')])).toBe('~/p\nchat a: done\nchat b: done')
  })
})

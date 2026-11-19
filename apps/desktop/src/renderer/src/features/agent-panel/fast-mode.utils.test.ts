import { it, expect, describe } from 'vitest'

import { fastAsked } from './fast-mode.utils'

describe('/fast', () => {
  it('on и off - прямо, голая команда - переключить', () => {
    expect(fastAsked('on', false)).toBe(true)
    expect(fastAsked(' OFF ', true)).toBe(false)
    expect(fastAsked('', undefined)).toBe(true)
    expect(fastAsked('', true)).toBe(false)
  })
})

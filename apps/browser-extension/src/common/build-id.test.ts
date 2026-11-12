import { it, expect, describe } from 'vitest'

import { shouldReload, buildFromVersionName } from './build-id'

describe('сборка расширения', () => {
  it('читается из version_name', () => {
    expect(buildFromVersionName('0.1.0 (3f2a9c01b2de)')).toBe('3f2a9c01b2de')
    expect(buildFromVersionName('0.1.0')).toBe('dev')
    expect(buildFromVersionName(undefined)).toBe('dev')
  })

  it('перезагрузка - один раз на новую сборку', () => {
    expect(shouldReload('a', 'b', null)).toBe(true)
    expect(shouldReload('a', 'b', 'b')).toBe(false)
    expect(shouldReload('a', 'a', null)).toBe(false)
    expect(shouldReload('a', null, null)).toBe(false)
  })
})

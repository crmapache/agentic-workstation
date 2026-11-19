import { it, expect, describe } from 'vitest'

import { parseOpenCodeVersion } from './opencode-locator'

describe('версия OpenCode', () => {
  it('из `opencode --version`; чужая строка - пусто', () => {
    expect(parseOpenCodeVersion('opencode v2.3.2\n')).toBe('2.3.2')
    expect(parseOpenCodeVersion('opencode 2.4.0')).toBe('2.4.0')
    expect(parseOpenCodeVersion('something else')).toBe('')
  })
})

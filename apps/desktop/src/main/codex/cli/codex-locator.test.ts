import { it, expect, describe } from 'vitest'

import { isAtLeast, parseCodexVersion } from './codex-locator'

describe('версия Codex', () => {
  it('из `codex --version`; чужая строка - пусто', () => {
    expect(parseCodexVersion('codex-cli 0.163.0\n')).toBe('0.163.0')
    expect(parseCodexVersion('something else')).toBe('')
  })

  it('сравнение по числам, неизвестная версия - младше всех', () => {
    expect(isAtLeast('0.163.0', '0.160.0')).toBe(true)
    expect(isAtLeast('0.160.0', '0.160.0')).toBe(true)
    expect(isAtLeast('0.152.4', '0.160.0')).toBe(false)
    expect(isAtLeast('1.0.0', '0.999.9')).toBe(true)
    expect(isAtLeast('', '0.1.0')).toBe(false)
  })
})

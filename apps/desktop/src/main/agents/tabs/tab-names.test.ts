import { it, expect, describe } from 'vitest'

import { OWN_TITLE_MAX } from '@shared/claude'

import { rankOf, outranks, ownTitle } from './tab-names'

describe('имя вкладки', () => {
  it('ранги: заглушка < догадка < модель < человек', () => {
    expect(rankOf('default')).toBeLessThan(rankOf('heuristic'))
    expect(rankOf('heuristic')).toBeLessThan(rankOf('llm'))
    expect(rankOf('llm')).toBeLessThan(rankOf('user'))
  })

  it('младший старшего не перебивает, равный - перебивает', () => {
    expect(outranks('llm', 'user')).toBe(false)
    expect(outranks('heuristic', 'llm')).toBe(false)
    expect(outranks('llm', 'heuristic')).toBe(true)
    expect(outranks('llm', 'llm')).toBe(true)
    expect(outranks('user', 'user')).toBe(true)
  })

  it('имя от человека - одна строка без управляющих символов', () => {
    expect(ownTitle('  Fix\nthe\tauth \u0007 flow  ')).toBe('Fix the auth flow')
    expect(ownTitle(' \n\t ')).toBeNull()
  })

  it('длинное режется по кодовым точкам: эмодзи пополам не рвётся', () => {
    const long = `${'a'.repeat(OWN_TITLE_MAX - 1)}😀tail`
    const cut = ownTitle(long) ?? ''

    expect(Array.from(cut)).toHaveLength(OWN_TITLE_MAX)
    expect(cut.endsWith('😀')).toBe(true)
  })
})

import { it, expect, describe } from 'vitest'

import { labelSlug, serverNameFor } from './connector-names'

describe('labelSlug', () => {
  it('сводит подпись к латинице, цифрам и дефисам', () => {
    expect(labelSlug('Work Mail')).toBe('work-mail')
    expect(labelSlug('  ReClick / 2026 ')).toBe('reclick-2026')
    expect(labelSlug('café')).toBe('cafe')
  })

  it('без латиницы и цифр - пусто', () => {
    expect(labelSlug('рабочая')).toBe('')
    expect(labelSlug('---')).toBe('')
  })

  it('режет длинную подпись без дефиса на конце', () => {
    const slug = labelSlug('a'.repeat(23) + ' tail')

    expect(slug).toBe('a'.repeat(23))
  })
})

describe('serverNameFor', () => {
  it('ставит тип перед подписью', () => {
    expect(serverNameFor('gmail', 'Work')).toBe('gmail-work')
    expect(serverNameFor('mcp', 'Linear')).toBe('linear')
    expect(serverNameFor('command', 'playwright-1')).toBe('playwright-1')
  })

  it('пустая подпись - нет имени', () => {
    expect(serverNameFor('notion', 'личный')).toBeNull()
  })
})

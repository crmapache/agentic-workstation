import { it, expect, describe } from 'vitest'

import { setsValue, sameFieldValue, fieldValueRefused } from './field-values'

describe('поля даты, времени, цвета и ползунка', () => {
  it('значение ставится напрямую только у таких полей ввода', () => {
    for (const type of ['date', 'time', 'datetime-local', 'month', 'week', 'color', 'range']) {
      expect(setsValue('input', type)).toBe(true)
    }

    expect(setsValue('input', 'text')).toBe(false)
    expect(setsValue('textarea', 'date')).toBe(false)
  })

  it('взяло ли поле значение: цвет - без регистра, ползунок - числом, остальное - как есть', () => {
    expect(sameFieldValue('date', '2026-11-10', ' 2026-11-10 ')).toBe(true)
    expect(sameFieldValue('date', '', '10/11/2026')).toBe(false)
    expect(sameFieldValue('color', '#ff8800', '#FF8800')).toBe(true)
    expect(sameFieldValue('range', '50', '50.0')).toBe(true)
    expect(sameFieldValue('range', '50', '50.3')).toBe(false)
    expect(sameFieldValue('range', '50', '')).toBe(false)
  })

  it('отказ называет формат, а у ползунка - пределы', () => {
    expect(fieldValueRefused('date', '10/11/2026', '', { min: '', max: '', step: '' })).toBe(
      'The date field did not take "10/11/2026". Expected: YYYY-MM-DD, like 2026-11-10.',
    )
    expect(fieldValueRefused('range', '7.5', '8', { min: '0', max: '10', step: '1' })).toMatch(
      /holds "8".*\(min 0, max 10, step 1\)/,
    )
  })
})

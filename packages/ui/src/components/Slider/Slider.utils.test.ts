import { it, expect, describe } from 'vitest'

import { sliderFraction } from './Slider.utils'

describe('доля пути ползунка', () => {
  it('считается от начала шкалы, а не от нуля', () => {
    expect(sliderFraction(70, 0, 100)).toBe(0.7)
    expect(sliderFraction(1.5, 1, 2)).toBe(0.5)
  })

  it('значение за краем шкалы упирается в край', () => {
    expect(sliderFraction(-5, 0, 100)).toBe(0)
    expect(sliderFraction(140, 0, 100)).toBe(1)
  })

  it('шкала без длины - пустая заливка, а не деление на ноль', () => {
    expect(sliderFraction(3, 3, 3)).toBe(0)
  })
})

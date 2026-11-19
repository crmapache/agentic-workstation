import { it, expect, describe } from 'vitest'

import { nextFit, fitSteps, firstLetter } from './composer-fit.utils'

const all = new Set(['slash', 'search'] as const)

describe('шаги ряда кнопок', () => {
  it('имя чипа редактора - первым, потом «/» и лупа', () => {
    expect(fitSteps('named', all)).toEqual(['editorName', 'slash', 'search'])
    expect(fitSteps('named', new Set(['search', 'slash']))).toEqual([
      'editorName',
      'slash',
      'search',
    ])
    expect(fitSteps('muted', all)).toEqual(['editorChip', 'slash', 'search'])
    expect(fitSteps(null, new Set(['search']))).toEqual(['search'])
  })
})

describe('сколько отдать', () => {
  it('не хватает места - ещё шаг; все отданы - дальше сужаются Send и Queue', () => {
    expect(nextFit(0, 4, 12, 0)).toBe(1)
    expect(nextFit(4, 4, 12, 30)).toBe(4)
  })

  it('впритык - не трогать', () => {
    expect(nextFit(2, 4, 0.3, 24)).toBe(2)
  })

  it('вернуть - только с пикселем запаса, чтобы ряд не мигал', () => {
    expect(nextFit(2, 4, -25.5, 24)).toBe(1)
    expect(nextFit(2, 4, -24.5, 24)).toBe(2)
  })

  it('шагов стало меньше (чип редактора ушёл) - уровень не больше их числа', () => {
    expect(nextFit(4, 3, -2, 30)).toBe(3)
  })
})

describe('первая буква', () => {
  it('режет по кодовым точкам', () => {
    expect(firstLetter('Send')).toEqual(['S', 'end'])
    expect(firstLetter('𝒬ueue')).toEqual(['𝒬', 'ueue'])
    expect(firstLetter('')).toEqual(['', ''])
  })
})

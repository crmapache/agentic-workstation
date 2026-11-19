import { it, expect, describe } from 'vitest'

import { columns, fitMiddle, splitTitle } from './ClosableTab.utils'

/** Моноширинная мерка: буква - 10 пикселей, многоточие - тоже 10. */
const LETTER = 10
const measureOf = (title: string) => (from: number, to: number) =>
  Array.from(title.slice(from, to)).length * LETTER

describe('подпись вкладки, обрезанная посередине', () => {
  it('хвост - последнее слово с пробелом перед ним', () => {
    expect(splitTitle('Refactor auth module tests')).toEqual({
      head: 'Refactor auth module',
      tail: ' tests',
    })
  })

  it('короткое имя и слишком длинное последнее слово не делятся', () => {
    expect(splitTitle('Fix the bug')).toEqual({ head: 'Fix the bug', tail: '' })
    expect(splitTitle('Look at src/features/agent-panel/ConversationTabs.tsx').tail).toBe('')
  })

  it('китайский и японский без пробелов - хвостом последние четыре знака', () => {
    expect(splitTitle('重构认证模块并修复测试用例')).toEqual({
      head: '重构认证模块并修复',
      tail: '测试用例',
    })
    expect(columns('认证')).toBe(4)
  })

  it('влезает - целиком; нет - голова, многоточие и последнее слово', () => {
    const title = 'Refactor auth module tests'
    const measure = measureOf(title)

    expect(fitMiddle(title, 300, measure, LETTER)).toBe(title)
    // 160 пикселей: многоточие и « tests» - 70, на голову остаётся 9 букв.
    expect(fitMiddle(title, 160, measure, LETTER)).toBe('Refactor… tests')
  })

  it('голове не остаётся и двух букв - режется с конца', () => {
    const title = 'Refactor auth module tests'

    expect(fitMiddle(title, 80, measureOf(title), LETTER)).toBe('Refacto…')
  })
})

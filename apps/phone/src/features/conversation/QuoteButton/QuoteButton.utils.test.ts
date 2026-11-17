import { it, expect, describe } from 'vitest'

import { placementOf } from './QuoteButton.utils'

const body = { top: 100, bottom: 700 }

describe('где кнопка цитаты', () => {
  it('выделено выше нижней полосы - кнопка внизу, у поля', () => {
    expect(placementOf({ top: 300, bottom: 340 }, body)).toBe('bottom')
  })

  it('выделено у самого низа - кнопка наверх, чтобы не закрыть его', () => {
    expect(placementOf({ top: 650, bottom: 690 }, body)).toBe('top')
  })

  it('выделено от верха до низа - внизу: наверху она закрыла бы его так же', () => {
    expect(placementOf({ top: 120, bottom: 690 }, body)).toBe('bottom')
  })
})

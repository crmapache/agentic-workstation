import { it, expect, describe } from 'vitest'

import { objectKey } from './object-key'

describe('ключ события из стора', () => {
  it('тот же объект - тот же ключ: перерисовка не сбрасывает отсчёт', () => {
    const notice = { title: 'Pushed' }

    expect(objectKey(notice)).toBe(objectKey(notice))
  })

  it('новый объект с тем же текстом - новый ключ: отсчёт начинается заново', () => {
    expect(objectKey({ title: 'Pushed' })).not.toBe(objectKey({ title: 'Pushed' }))
  })
})

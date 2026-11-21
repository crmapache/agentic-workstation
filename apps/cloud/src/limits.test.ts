import { it, expect, describe } from 'vitest'

import { NonceBook } from './nonces.ts'
import { RateLimit } from './rate-limit.ts'

describe('предел частоты', () => {
  const clock = () => {
    const state = { at: 1_000_000 }

    return { state, now: () => state.at }
  }

  it('считает в скользящем окне и отпускает, когда отметки вышли из окна', () => {
    const { state, now } = clock()
    const limit = new RateLimit({ limit: 2, windowMs: 1000, maxKeys: 10, now })

    expect([limit.take('a'), limit.take('a'), limit.take('a')]).toEqual(['ok', 'ok', 'limited'])
    expect(limit.take('b')).toBe('ok')

    state.at += 999
    expect(limit.take('a')).toBe('limited')

    state.at += 1
    expect(limit.take('a')).toBe('ok')
    limit.dispose()
  })

  it('уборка забывает ключи без свежих отметок; потолок ключей - full, знакомым можно', () => {
    const { state, now } = clock()
    const limit = new RateLimit({ limit: 5, windowMs: 1000, maxKeys: 2, now })

    limit.take('a')
    limit.take('b')

    expect(limit.take('c')).toBe('full')
    expect(limit.take('a')).toBe('ok')

    state.at += 500
    limit.prune()
    expect(limit.size).toBe(2)

    state.at += 600
    limit.take('a')
    limit.prune()
    // b молчал дольше окна - забыт; a только что звонил - помнится.
    expect(limit.size).toBe(1)
    expect(limit.take('c')).toBe('ok')
    limit.dispose()
  })
})

describe('книга разовых чисел', () => {
  it('помнит число не меньше срока и забывает не позже двух', () => {
    const book = new NonceBook({ keepMs: 1000, cap: 100 }, 0)

    book.add('early', 0)
    book.add('late', 999)

    // Смена поколения: оба ещё помнятся.
    expect(book.has('early', 1000)).toBe(true)
    expect(book.has('late', 1998)).toBe(true)

    // Вторая смена: early и late прожили свой срок и забыты.
    expect(book.has('late', 2000)).toBe(false)
    expect(book.has('early', 2000)).toBe(false)
  })

  it('долгое затишье выбрасывает оба поколения разом', () => {
    const book = new NonceBook({ keepMs: 1000, cap: 100 }, 0)

    book.add('old', 500)
    expect(book.has('old', 2600)).toBe(false)
  })

  it('потолок: полная книга не принимает новых до смены поколений', () => {
    const book = new NonceBook({ keepMs: 1000, cap: 2 }, 0)

    book.add('a', 0)
    expect(book.isFull(0)).toBe(false)
    book.add('b', 0)
    expect(book.isFull(0)).toBe(true)
    // Первая смена: a и b ещё в прошлом поколении - книга всё ещё полна.
    expect(book.isFull(1000)).toBe(true)
    expect(book.isFull(2000)).toBe(false)
  })
})

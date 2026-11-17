import { it, vi, expect, describe } from 'vitest'

import { createMacCursor } from './cg-cursor'
import type { CursorNative } from './cg-cursor'

const fakeNative = (changes: Partial<CursorNative> = {}) => {
  const calls: string[] = []
  const native: CursorNative = {
    allowInBackground: () => {
      calls.push('allow')

      return 0
    },
    hide: () => {
      calls.push('hide')

      return 0
    },
    show: () => {
      calls.push('show')

      return 0
    },
    ...changes,
  }

  return { native, calls }
}

describe('системная стрелка мака', () => {
  it('просит разрешения прятать из фона один раз, прячет и возвращает', () => {
    const { native, calls } = fakeNative()
    const cursor = createMacCursor(() => native)

    expect(cursor.hide()).toBe(true)
    cursor.show()
    expect(cursor.hide()).toBe(true)
    expect(calls).toEqual(['allow', 'hide', 'show', 'hide'])
  })

  it('оконный сервер не разрешил - не прячет вовсе: стрелок было бы две', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { native, calls } = fakeNative({ allowInBackground: () => 1000 })
    const cursor = createMacCursor(() => native)

    expect(cursor.hide()).toBe(false)
    expect(cursor.hide()).toBe(false)
    expect(calls).toEqual([])
  })

  it('закрытого вызова нет в этой macOS - не прячет и больше не пробует', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const load = vi.fn((): CursorNative => {
      throw new Error('symbol not found')
    })
    const cursor = createMacCursor(load)

    expect(cursor.hide()).toBe(false)
    expect(() => cursor.show()).not.toThrow()
  })
})

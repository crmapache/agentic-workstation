import { it, expect, describe } from 'vitest'

import type { FeedItem } from '@shared/conversation-feed'

import { PIN_LIMIT } from './pins.constants'
import {
  pinHint,
  pinLine,
  gonePins,
  togglePin,
  shelfItems,
  pinnedItems,
  unloadedPins,
} from './pins.utils'

const items: FeedItem[] = [
  {
    id: 'u1',
    kind: 'user',
    parentToolUseId: null,
    text: 'fix   the\n@src/a.ts',
    time: 0,
    images: [],
    steering: false,
  },
  {
    id: 'a1',
    kind: 'assistant',
    parentToolUseId: null,
    text: '## Done\n**All** `green`',
    streaming: false,
  },
  { id: 'n1', kind: 'notice', parentToolUseId: null, code: 'rewound', detail: '', replayed: false },
  { id: 'a2', kind: 'assistant', parentToolUseId: null, text: 'x'.repeat(500), streaming: false },
]

describe('закреплённые', () => {
  it('четвёртый не вытесняет старый: тот же массив', () => {
    const full = ['a', 'b', 'c']

    expect(full).toHaveLength(PIN_LIMIT)
    expect(togglePin(full, 'd')).toBe(full)
    expect(togglePin(full, 'b')).toEqual(['a', 'c'])
    expect(togglePin(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('на полке - порядок разговора; служебное и пропавшее не встают', () => {
    expect(pinnedItems(items, ['a2', 'u1', 'n1', 'gone']).map((item) => item.id)).toEqual([
      'u1',
      'a2',
    ])
  })

  it('строка: пробелы схлопнуты, разметки нет, длина ограничена', () => {
    const [user, answer, long] = pinnedItems(items, ['u1', 'a1', 'a2'])

    expect(user && pinLine(user)).toBe('fix the a.ts')
    expect(answer && pinLine(answer)).toBe('Done All green')
    expect(long && pinLine(long).length).toBeLessThan(250)
    expect(answer && pinHint(answer)).toBe('Done\nAll green')
  })

  it('выше загруженного: найденное главным процессом - над загруженным, загруженное - из ленты', () => {
    const early: FeedItem = {
      id: 'a0',
      kind: 'assistant',
      parentToolUseId: null,
      text: 'early',
      streaming: false,
    }
    const stale: FeedItem = { ...early, id: 'a1', text: 'old copy' }
    const pins = ['a1', 'a0', 'u1']

    expect(unloadedPins(items, pins)).toEqual(['a0'])
    expect(shelfItems(items, pins, null).map((item) => item.id)).toEqual(['u1', 'a1'])

    const shelf = shelfItems(items, pins, [early, stale])

    expect(shelf.map((item) => item.id)).toEqual(['a0', 'u1', 'a1'])
    expect(shelf.find((item) => item.id === 'a1')).toBe(items[1])
    // Открепили, пока ответ ехал: старый ответ не возвращает снятое.
    expect(shelfItems(items, ['u1'], [early]).map((item) => item.id)).toEqual(['u1'])
  })

  it('не найденное главным процессом - нет в разговоре', () => {
    expect(
      gonePins(['a0', 'gone'], [items[1] as FeedItem, { ...(items[1] as FeedItem), id: 'a0' }]),
    ).toEqual(['gone'])
    expect(gonePins(['a0'], [])).toEqual(['a0'])
  })
})

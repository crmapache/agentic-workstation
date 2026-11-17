import { it, expect, describe } from 'vitest'

import { quoteOf, messageText, splitQuotes } from './quotes.utils'

describe('цитаты', () => {
  it('выделение - одной строкой, без краевых пробелов', () => {
    expect(quoteOf('  Оператор пока\nне подключился,\n\n стою  в очереди. ')).toBe(
      'Оператор пока не подключился, стою в очереди.',
    )
  })

  it('пара букв - промах пальца, не цитата', () => {
    expect(quoteOf(' ok ')).toBeNull()
    expect(quoteOf('yes')).toBe('yes')
  })

  it('сообщение - цитаты строками «> » сверху, слова под ними, как у IDE', () => {
    expect(messageText(['first', 'second'], 'why?')).toBe('> first\n> second\nwhy?')
    expect(messageText(['only'], '')).toBe('> only')
    expect(messageText([], 'plain')).toBe('plain')
  })

  it('сообщение обратно - цитаты сверху и слова под ними', () => {
    expect(splitQuotes('> first\n> second\nwhy?\n> not a quote')).toEqual({
      quotes: ['first', 'second'],
      body: 'why?\n> not a quote',
    })
    expect(splitQuotes('plain')).toEqual({ quotes: [], body: 'plain' })
  })
})

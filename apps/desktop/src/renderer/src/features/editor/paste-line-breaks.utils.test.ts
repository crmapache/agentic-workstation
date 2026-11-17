import { it, expect, describe } from 'vitest'

import { plainPastePayload, withPlainLineBreaks } from './paste-line-breaks.utils'

describe('withPlainLineBreaks', () => {
  it('turns line, paragraph separators and NEL into plain line breaks', () => {
    expect(withPlainLineBreaks('a\u2028b\u2029c\u0085d')).toBe('a\nb\nc\nd')
  })

  it('leaves ordinary line breaks alone', () => {
    expect(withPlainLineBreaks('a\r\nb\nc\rd')).toBe('a\r\nb\nc\rd')
  })
})

describe('plainPastePayload', () => {
  it('gives text from another app real line breaks and keeps the rest of the paste', () => {
    const clipboardEvent = {}

    expect(
      plainPastePayload(
        { text: 'key\u2028value', pasteOnNewLine: false, multicursorText: null, clipboardEvent },
        '',
      ),
    ).toEqual({ text: 'key\nvalue', pasteOnNewLine: false, multicursorText: null, clipboardEvent })
  })

  it('fixes every cursor part of a multi-cursor paste', () => {
    expect(
      plainPastePayload({ text: 'a\u2028b\nc', multicursorText: ['a\u2028b', 'c'] }, ''),
    ).toEqual({
      text: 'a\nb\nc',
      multicursorText: ['a\nb', 'c'],
    })
  })

  it('pastes text copied from code as it was', () => {
    const payload = { text: '"a\u2028b"', multicursorText: null }

    expect(plainPastePayload(payload, '"a\u2028b"')).toBe(payload)
  })

  it('passes a paste without text through', () => {
    expect(plainPastePayload(null, '')).toBeNull()
    expect(plainPastePayload({ pasteOnNewLine: true }, '')).toEqual({ pasteOnNewLine: true })
  })
})

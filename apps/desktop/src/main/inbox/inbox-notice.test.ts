import { homedir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { DAY_MS, MINUTE_MS } from '@shared/time-units'

import { noticeOf, buttonsOf, parseWhen, NoticeError } from './inbox-notice'

const now = new Date(2026, 10, 16, 12, 0).getTime()

describe('parseWhen', () => {
  it('reads time without an offset as local time', () => {
    expect(parseWhen('2026-12-01T09:00', now)).toBe(new Date(2026, 11, 1, 9, 0).getTime())
    expect(parseWhen('2026-12-01 09:30', now)).toBe(new Date(2026, 11, 1, 9, 30).getTime())
  })

  it('respects an explicit offset', () => {
    expect(parseWhen('2026-12-01T09:00:00Z', now)).toBe(Date.UTC(2026, 11, 1, 9, 0))
  })

  it('takes empty and just-now as now', () => {
    expect(parseWhen('', now)).toBe(0)
    expect(parseWhen(new Date(now - MINUTE_MS).toISOString(), now)).toBe(0)
  })

  it('refuses a date without time and a day or hour that does not exist', () => {
    expect(() => parseWhen('2026-12-01', now)).toThrow(NoticeError)
    expect(() => parseWhen('2027-02-30T09:00', now)).toThrow(NoticeError)
    expect(() => parseWhen('2026-12-01T24:00', now)).toThrow(NoticeError)
  })

  it('refuses the past, far future and garbage', () => {
    expect(() => parseWhen(new Date(now - DAY_MS).toISOString(), now)).toThrow(NoticeError)
    expect(() => parseWhen(new Date(now + 400 * DAY_MS).toISOString(), now)).toThrow(NoticeError)
    expect(() => parseWhen('tomorrow morning', now)).toThrow(NoticeError)
  })
})

describe('buttonsOf', () => {
  it('makes the first button the main one and expands ~ in paths', () => {
    const [open, done] = buttonsOf(
      [
        { label: 'Open invoice', type: 'open', value: '~/Downloads/invoice.pdf' },
        { label: 'Done', type: 'dismiss', value: '' },
      ],
      false,
    )

    expect(open).toMatchObject({
      id: 'b0',
      kind: 'open',
      primary: true,
      value: join(homedir(), 'Downloads/invoice.pdf'),
    })
    expect(done).toMatchObject({ id: 'b1', kind: 'dismiss', primary: false })
  })

  it('refuses a reply button where nothing can hear it', () => {
    expect(() => buttonsOf([{ label: 'Yes', type: 'reply', value: '' }], false)).toThrow(
      NoticeError,
    )
    expect(buttonsOf([{ label: 'Yes', type: 'reply', value: '' }], true)[0]?.kind).toBe('reply')
  })

  it('refuses a relative path, an empty label and too many buttons', () => {
    expect(() => buttonsOf([{ label: 'Open', type: 'open', value: 'invoice.pdf' }], true)).toThrow(
      NoticeError,
    )
    expect(() => buttonsOf([{ label: ' ', type: 'dismiss', value: '' }], true)).toThrow(NoticeError)
    expect(() =>
      buttonsOf(
        Array.from({ length: 5 }, () => ({ label: 'x', type: 'dismiss' as const, value: '' })),
        true,
      ),
    ).toThrow(NoticeError)
  })
})

describe('noticeOf', () => {
  it('needs a title and keeps the body as written', () => {
    expect(() =>
      noticeOf({ title: '', body: '', attention: false, at: '', buttons: [] }, true, now),
    ).toThrow(NoticeError)

    expect(
      noticeOf(
        { title: '  Invoice\nready ', body: '**#12**', attention: true, at: '', buttons: [] },
        true,
        now,
      ),
    ).toMatchObject({ title: 'Invoice ready', body: '**#12**', tone: 'attention', deliverAt: 0 })
  })
})

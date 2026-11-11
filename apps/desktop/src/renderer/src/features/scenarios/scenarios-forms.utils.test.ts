import { it, expect, describe } from 'vitest'

import {
  hourOf,
  minuteOf,
  scopeFor,
  withHour,
  waitClock,
  withMinute,
  answerChips,
  withoutStop,
  freshDraftId,
  minutesOfDay,
  draftErrorCode,
} from './scenarios-forms.utils'

describe('номер черновика', () => {
  it('16 знаков a-z0-9, каждый раз новый', () => {
    const first = freshDraftId()

    expect(first).toMatch(/^[a-z0-9]{16}$/)
    expect(freshDraftId()).not.toBe(first)
  })
})

describe('часы ожидания', () => {
  it('минуты и секунды, часы - только когда дошло до них', () => {
    expect(waitClock(0)).toBe('0:00')
    expect(waitClock(42_400)).toBe('0:42')
    expect(waitClock(12 * 60_000 + 5_000)).toBe('12:05')
    expect(waitClock(3_723_000)).toBe('1:02:03')
  })

  it('часы, отстающие от начала, не уходят в минус', () => {
    expect(waitClock(-500)).toBe('0:00')
  })
})

describe('слова отказов', () => {
  it('коды писателя узнаются, слова CLI остаются словами', () => {
    expect(draftErrorCode('timeout')).toBe('timeout')
    expect(draftErrorCode('Credit balance is too low')).toBeNull()
    expect(draftErrorCode('toString')).toBeNull()
  })

  it('фраза встаёт внутрь другой без двойной точки', () => {
    expect(withoutStop('Claude Code is not installed.')).toBe('Claude Code is not installed')
    expect(withoutStop('Stopped by you')).toBe('Stopped by you')
  })
})

describe('ответы чипами', () => {
  it('пустые не рисуются, ссылка - хвостом, длинное - первой строкой', () => {
    expect(
      answerChips({
        ticket: 'https://tracker.example/browse/ABC-12',
        notes: '  ',
        branch: 'alex/totals\nsecond line',
      }),
    ).toEqual([
      { name: 'ticket', value: 'ABC-12' },
      { name: 'branch', value: 'alex/totals' },
    ])
  })
})

describe('час формы по частям', () => {
  it('часы и минуты меняются по отдельности', () => {
    expect(hourOf(23 * 60 + 15)).toBe(23)
    expect(minuteOf(23 * 60 + 15)).toBe(15)
    expect(withHour(23 * 60 + 15, 8)).toBe(8 * 60 + 15)
    expect(withMinute(23 * 60 + 15, 40)).toBe(23 * 60 + 40)
  })

  it('час с диска за пределами суток прижимается', () => {
    expect(hourOf(-10)).toBe(0)
    expect(hourOf(24 * 60 + 5)).toBe(23)
  })

  it('час пропущенной строки - местный час момента', () => {
    expect(minutesOfDay(new Date(2026, 9, 19, 9, 35).getTime())).toBe(9 * 60 + 35)
  })
})

describe('полка нового сценария', () => {
  it('без папки проекта - только личная', () => {
    expect(scopeFor('project', true)).toBe('project')
    expect(scopeFor('project', false)).toBe('user')
  })
})

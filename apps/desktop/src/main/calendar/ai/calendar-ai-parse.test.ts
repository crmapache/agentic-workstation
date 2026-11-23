import { it, expect, describe } from 'vitest'

import { parseCalendarAnswer } from './calendar-ai-parse'

/** Спросили 23-30 ноября 2026 (UTC, для простоты). */
const ASKED = { from: Date.UTC(2026, 10, 23), to: Date.UTC(2026, 10, 30) }

const event = (patch: Record<string, unknown> = {}) => ({
  title: 'Client call',
  start: '2026-11-24T09:00',
  end: '2026-11-24T10:00',
  all_day: false,
  status: 'confirmed',
  show_as: 'busy',
  my_response: 'accepted',
  join_url: 'https://teams.microsoft.com/l/meetup-join/x',
  location: null,
  organizer: 'Ana',
  ...patch,
})

const answer = (patch: Record<string, unknown> = {}) => ({
  status: 'ok',
  time_zone: 'America/Costa_Rica',
  covered_from: '2026-11-23',
  covered_to: '2026-11-27',
  note: '',
  events: [event()],
  ...patch,
})

describe('AI calendar answer', () => {
  it('turns page wall time in the page zone into UTC and keeps the covered days', () => {
    const result = parseCalendarAnswer(answer(), 'work', ASKED)

    expect(result.ok && result.events[0]).toMatchObject({
      start: Date.UTC(2026, 10, 24, 15),
      end: Date.UTC(2026, 10, 24, 16),
      response: 'accepted',
      busy: 'busy',
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/x',
      sourceId: 'work',
    })
    // 23 ноября 00:00 в Коста-Рике - 06:00 UTC; конец - полночь после 27-го.
    expect(result.ok && result.covered).toEqual({
      from: Date.UTC(2026, 10, 23, 6),
      to: Date.UTC(2026, 10, 28, 6),
    })
  })

  it('keeps the covered window inside what was asked', () => {
    const result = parseCalendarAnswer(
      answer({ covered_from: '2026-11-01', covered_to: '2026-12-31' }),
      'work',
      ASKED,
    )

    expect(result.ok && result.covered).toEqual(ASKED)
  })

  it('gives a stable uid to the same meeting between syncs', () => {
    const a = parseCalendarAnswer(answer(), 'work', ASKED)
    const b = parseCalendarAnswer(
      answer({ events: [event({ title: ' client  CALL ' })] }),
      'work',
      ASKED,
    )

    expect(a.ok && b.ok && a.events[0]?.uid === b.events[0]?.uid).toBe(true)
  })

  it('reads all-day events by dates and maps out of office and not responded', () => {
    const result = parseCalendarAnswer(
      answer({
        events: [
          event({
            all_day: true,
            start: '2026-11-26',
            end: '2026-11-27',
            show_as: 'out_of_office',
          }),
          event({ title: 'Sync', my_response: 'not_responded', join_url: 'javascript:alert(1)' }),
        ],
      }),
      'work',
      ASKED,
    )

    expect(
      result.ok && result.events.map((one) => [one.allDay, one.busy, one.response, one.joinUrl]),
    ).toEqual([
      [
        { from: '2026-11-26', to: '2026-11-27' },
        'away',
        'accepted',
        'https://teams.microsoft.com/l/meetup-join/x',
      ],
      [null, 'busy', 'pending', null],
    ])
  })

  it('answers sign-in and failures by code', () => {
    expect(parseCalendarAnswer(answer({ status: 'login_required' }), 'w', ASKED)).toEqual({
      ok: false,
      failure: 'login-required',
    })
    expect(parseCalendarAnswer(answer({ time_zone: 'Pacific Standard Time' }), 'w', ASKED)).toEqual(
      {
        ok: false,
        failure: 'ai-invalid',
      },
    )
    expect(parseCalendarAnswer({ nonsense: true }, 'w', ASKED)).toEqual({
      ok: false,
      failure: 'ai-invalid',
    })
  })

  it('drops a few bad events but refuses an answer that is mostly garbage', () => {
    const fewBad = parseCalendarAnswer(
      answer({
        events: [
          event(),
          event({ title: 'B', start: '2026-11-25T11:00', end: '2026-11-25T12:00' }),
          event({ title: 'C', start: '2026-11-25T13:00', end: '2026-11-25T14:00' }),
          event({ title: 'D', start: '2026-11-26T09:00', end: '2026-11-26T10:00' }),
          event({ start: 'tomorrow' }),
        ],
      }),
      'w',
      ASKED,
    )
    const mostlyBad = parseCalendarAnswer(
      answer({ events: [event(), event({ start: 'x' }), event({ end: '2026-11-24T08:00' })] }),
      'w',
      ASKED,
    )

    expect(fewBad.ok && fewBad.events).toHaveLength(4)
    expect(mostlyBad).toEqual({ ok: false, failure: 'ai-invalid' })
  })
})

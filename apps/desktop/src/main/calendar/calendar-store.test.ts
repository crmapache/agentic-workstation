import { it, expect, describe } from 'vitest'

import { parseStoredEvents } from './calendar-store'

const stored = (patch: Record<string, unknown> = {}) => ({
  key: 'personal|a|',
  sourceId: 'personal',
  uid: 'a',
  title: 'Meeting',
  start: 1000,
  end: 2000,
  allDay: null,
  status: 'confirmed',
  busy: 'busy',
  response: 'organizer',
  joinUrl: null,
  location: null,
  ...patch,
})

const formatsOf = (events: Record<string, unknown>[]) =>
  (
    parseStoredEvents({ bySource: { personal: events } }, ['personal']).bySource['personal'] ?? []
  ).map((event) => event.format)

describe('события с диска', () => {
  it('снимок до звонка-или-лично - решается по ссылке и месту', () => {
    expect(
      formatsOf([
        stored({ location: 'Banco Nacional, City Mall Alajuela' }),
        stored({ joinUrl: 'https://meet.google.com/a-b-c' }),
        stored(),
      ]),
    ).toEqual(['in-person', 'call', 'unknown'])
  })

  it('записанное решение остаётся, кривое - решается заново', () => {
    expect(
      formatsOf([stored({ format: 'call' }), stored({ format: 'zoom', location: 'Room 4' })]),
    ).toEqual(['call', 'in-person'])
  })
})

import { it, expect, describe } from 'vitest'

import { HOUR_MS, MINUTE_MS } from '@shared/time-units'

import { lifeOf, waitOf, newLife } from './goal-parse'

const now = new Date(2026, 10, 18, 10, 0).getTime()

describe('waitOf', () => {
  it('takes watches, looks, a local time and the person', () => {
    const wait = waitOf(
      {
        reason: '  Corey\n reply ',
        until: '2026-11-18T12:00',
        person: true,
        watch: [{ server: 'gmail-work', tool: 'read_thread', args: { id: 't' }, expect: 'reply' }],
        look: [{ instructions: 'Check the ticket page', expect: 'answered', every_minutes: 5 }],
      },
      now,
    )

    expect(wait).toMatchObject({ reason: 'Corey reply', until: now + 2 * HOUR_MS, person: true })
    expect(wait.watches.map((watch) => [watch.kind, watch.everyMin])).toEqual([
      ['tool', 10],
      ['look', 15],
    ])
    expect(wait.watches[0]?.nextAt).toBe(now)
  })

  it('refuses a wait that nothing would wake, and a bad watch', () => {
    expect(() => waitOf({ reason: 'x' }, now)).toThrow('Say what wakes you')
    expect(() => waitOf({ watch: [] }, now)).toThrow('"reason"')
    expect(() =>
      waitOf({ reason: 'x', watch: [{ server: 'Gmail Work', tool: 't', expect: '' }] }, now),
    ).toThrow('server')
    expect(() => waitOf({ reason: 'x', until: '2026-11-18' }, now)).toThrow('"until"')
    expect(() => waitOf({ reason: 'x', until: '2026-11-17T09:00' }, now)).toThrow('past')
  })

  it('keeps a step of a watch within its bounds', () => {
    const wait = waitOf(
      { reason: 'x', watch: [{ server: 'a', tool: 'b', expect: '', every_minutes: 0.5 }] },
      now,
    )

    expect(wait.watches[0]?.everyMin).toBe(2)
    expect(now + 2 * MINUTE_MS).toBeGreaterThan(wait.watches[0]?.nextAt ?? 0)
  })
})

describe('lifeOf', () => {
  it('reads back a stored life and drops what is not one', () => {
    const life = { ...newLife('r', 't', now), journal: 'Wrote to Corey.' }

    expect(lifeOf(JSON.parse(JSON.stringify(life)))).toEqual(life)
    expect(lifeOf({ runId: 'r' })).toBeNull()
  })
})

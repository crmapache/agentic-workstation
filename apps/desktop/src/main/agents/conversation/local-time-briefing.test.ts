import { it, expect, describe } from 'vitest'

import { withLocalTime, localTimeBriefing } from './local-time-briefing'

const WINTER = new Date(Date.UTC(2026, 10, 26, 18))
const SUMMER = new Date(Date.UTC(2026, 6, 1, 12))

describe('local time briefing', () => {
  it('names the zone and its offset at the moment', () => {
    expect(localTimeBriefing(WINTER, 'America/Costa_Rica')).toContain(
      'time zone America/Costa_Rica (UTC-06:00 now)',
    )
    expect(localTimeBriefing(SUMMER, 'Europe/Madrid')).toContain('(UTC+02:00 now)')
    expect(localTimeBriefing(WINTER, 'UTC')).toContain('(UTC+00:00 now)')
  })

  it('asks for local time and keeps UTC for when it is called for', () => {
    const line = localTimeBriefing(WINTER, 'America/Costa_Rica')

    expect(line).toMatch(/every date and time in this zone/)
    expect(line).toMatch(/Name UTC or another zone only when/)
  })

  it('fits a launch argument: one line, no quotes', () => {
    expect(localTimeBriefing(WINTER, 'America/Costa_Rica')).not.toMatch(/[\n\r"'`]/)
  })

  it('goes after the briefing it joins, alone when there is none', () => {
    const line = localTimeBriefing(WINTER, 'Europe/Madrid')

    expect(withLocalTime('Head of a run.', WINTER, 'Europe/Madrid')).toBe(`Head of a run. ${line}`)
    expect(withLocalTime('', WINTER, 'Europe/Madrid')).toBe(line)
  })
})

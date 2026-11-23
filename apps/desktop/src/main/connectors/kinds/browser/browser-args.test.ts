import { it, expect, describe } from 'vitest'

import { allowedUrl, pinnedSiteAllows } from './browser-args'

describe('pinned sites', () => {
  const hosts = ['outlook.office.com']

  it('lets a run open its site and subdomains, and a blank tab', () => {
    expect(
      pinnedSiteAllows('https://outlook.office.com/calendar/view/week/2026/11/30', hosts),
    ).toBe(true)
    expect(pinnedSiteAllows('https://www.office.com/', hosts)).toBe(true)
    expect(pinnedSiteAllows('', hosts)).toBe(true)
  })

  it('refuses other sites, other schemes and lookalikes', () => {
    expect(pinnedSiteAllows('https://evil.example/?d=secret', hosts)).toBe(false)
    expect(pinnedSiteAllows('https://office.com.evil.example/', hosts)).toBe(false)
    expect(pinnedSiteAllows('file:///etc/passwd', hosts)).toBe(false)
    expect(pinnedSiteAllows('javascript:alert(1)', hosts)).toBe(false)
  })

  it('keeps country domains apart', () => {
    expect(pinnedSiteAllows('https://mail.example.co.uk/', ['cal.example.co.uk'])).toBe(true)
    expect(pinnedSiteAllows('https://other.co.uk/', ['cal.example.co.uk'])).toBe(false)
  })

  it('allows everything without a pin', () => {
    expect(pinnedSiteAllows('https://any.example/', [])).toBe(true)
    expect(pinnedSiteAllows('https://any.example/', undefined)).toBe(true)
  })

  it('throws a reason the model can read', async () => {
    await expect(allowedUrl('https://evil.example/', null, hosts)).rejects.toThrow(
      /may open only outlook\.office\.com/,
    )
  })
})

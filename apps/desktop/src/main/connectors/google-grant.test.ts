import { it, expect, describe } from 'vitest'

import { sharesGoogleGrant } from './google-grant'

const holder = (id: string, account: string | null, clientId: string | null = 'c1') => ({
  id,
  account,
  clientId,
})

describe('sharesGoogleGrant', () => {
  it('тот же аккаунт и клиент - разрешение общее, отзывать нельзя', () => {
    const me = holder('gmail', 'Me@Work.com')

    expect(sharesGoogleGrant(me, [me, holder('calendar', 'me@work.com')])).toBe(true)
  })

  it('последний на аккаунте, другой аккаунт или клиент - своё', () => {
    const me = holder('gmail', 'me@work.com')

    expect(sharesGoogleGrant(me, [me])).toBe(false)
    expect(sharesGoogleGrant(me, [me, holder('calendar', 'me@home.com')])).toBe(false)
    expect(sharesGoogleGrant(me, [me, holder('calendar', 'me@work.com', 'c2')])).toBe(false)
    expect(sharesGoogleGrant(me, [me, holder('calendar', 'me@work.com', null)])).toBe(false)
  })

  it('аккаунт неизвестен - считаем общим', () => {
    expect(sharesGoogleGrant(holder('gmail', null), [holder('calendar', 'x@y.com')])).toBe(true)
  })
})

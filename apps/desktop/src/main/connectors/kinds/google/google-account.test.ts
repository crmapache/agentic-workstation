import { it, vi, expect, describe } from 'vitest'

import { isApiDisabled, checkGoogleAccount } from './google-account'

const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('checkGoogleAccount', () => {
  it('Gmail - адрес ящика, Calendar - id основного календаря', async () => {
    expect(await checkGoogleAccount('gmail', 't', reply(200, { emailAddress: 'a@x.com' }))).toEqual(
      {
        account: 'a@x.com',
      },
    )
    expect(await checkGoogleAccount('calendar', 't', reply(200, { id: 'a@x.com' }))).toEqual({
      account: 'a@x.com',
    })
  })

  it('выключенный API - своя причина, остальное - сбой входа', async () => {
    const disabled = {
      error: { message: 'Gmail API has not been used in project 1 before or it is disabled.' },
    }

    expect(await checkGoogleAccount('gmail', 't', reply(403, disabled))).toEqual({
      failure: 'google-api-disabled',
    })
    expect(await checkGoogleAccount('gmail', 't', reply(500, {}))).toEqual({
      failure: 'sign-in-failed',
    })
  })
})

describe('isApiDisabled', () => {
  it('узнаёт причину SERVICE_DISABLED', () => {
    expect(isApiDisabled({ error: { details: [{ reason: 'SERVICE_DISABLED' }] } })).toBe(true)
    expect(isApiDisabled({ error: { message: 'Insufficient Permission' } })).toBe(false)
  })
})

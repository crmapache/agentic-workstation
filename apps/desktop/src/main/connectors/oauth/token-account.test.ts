import { it, expect, describe } from 'vitest'

import { accountFromTokenResponse } from './token-account'

describe('accountFromTokenResponse', () => {
  it('Notion - рабочее пространство, Slack - команда', () => {
    expect(accountFromTokenResponse({ access_token: 'a', workspace_name: 'ReClick' })).toBe(
      'ReClick',
    )
    expect(accountFromTokenResponse({ access_token: 'a', team: { id: 'T1', name: 'Acme' } })).toBe(
      'Acme',
    )
  })

  it('не ответ с токеном или без имени - null', () => {
    expect(accountFromTokenResponse({ workspace_name: 'X' })).toBeNull()
    expect(accountFromTokenResponse({ access_token: 'a' })).toBeNull()
    expect(accountFromTokenResponse('x')).toBeNull()
  })
})

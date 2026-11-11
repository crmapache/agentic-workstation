import { it, expect, describe } from 'vitest'

import { EVERYWHERE } from '@shared/connector-availability'

import type { SecretsOf } from './connector-secrets'
import type { StoredConnector } from './connector-store'
import { SignInDesk } from './sign-in'

const connector = (id: string): StoredConnector => ({
  id,
  kind: 'notion',
  label: id,
  typeId: null,
  description: '',
  serverName: `notion-${id}`,
  url: null,
  auth: null,
  transport: null,
  command: null,
  spec: null,
  availability: EVERYWHERE,
  account: null,
  enabled: true,
  toolOverrides: {},
  tools: [],
})

const secrets = { read: () => ({}) } as unknown as SecretsOf

describe('SignInDesk', () => {
  it('вход становится идущим сразу, до порта возврата, и отменяется до него', async () => {
    const desk = new SignInDesk({ googleClient: () => null, openExternal: () => true })
    const result = desk.signIn(connector('a'), secrets)

    expect(desk.isSigningIn('a')).toBe(true)
    desk.cancel('a')
    expect(await result).toEqual({ failure: null })
    expect(desk.isSigningIn('a')).toBe(false)
  })

  it('новый вход сразу отменяет прежний и становится идущим', async () => {
    const desk = new SignInDesk({ googleClient: () => null, openExternal: () => true })
    const first = desk.signIn(connector('a'), secrets)
    const second = desk.signIn(connector('b'), secrets)

    expect(desk.isSigningIn('b')).toBe(true)
    expect(await first).toEqual({ failure: null })
    desk.cancel('b')
    expect(await second).toEqual({ failure: null })
  })
})

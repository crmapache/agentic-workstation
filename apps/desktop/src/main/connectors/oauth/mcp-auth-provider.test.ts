import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { SecretsOf } from '../connector-secrets'
import { Vault } from '../vault'
import { McpAuthProvider } from './mcp-auth-provider'

const cipher = {
  available: () => true,
  encrypt: (text: string) => Buffer.from(text),
  decrypt: (data: Buffer) => data.toString(),
}

const working = { access_token: 'old', token_type: 'Bearer', refresh_token: 'r', expires_in: 3600 }

describe('McpAuthProvider', () => {
  let dir = ''
  let secrets: SecretsOf

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcp-auth-'))
    secrets = new SecretsOf(await Vault.load(join(dir, 'vault.bin'), cipher), 'a')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('вход в браузере не трогает рабочий вход, пока не удался', async () => {
    await secrets.update({ tokens: working, tokensSavedAt: Date.now() })

    const provider = new McpAuthProvider(secrets, { state: 's', open: () => undefined })

    expect(provider.tokens()).toBeUndefined()
    await provider.saveTokens({ ...working, access_token: 'new' })
    await provider.invalidateCredentials('all')
    expect(secrets.read().tokens?.access_token).toBe('old')

    await provider.saveTokens({ ...working, access_token: 'new' })
    await provider.commitTokens()
    expect(secrets.read().tokens?.access_token).toBe('new')
  })

  it('только что сохранённые токены не стираются чужим отказом, старые - стираются', async () => {
    const provider = new McpAuthProvider(secrets)

    await provider.saveTokens(working)
    await provider.invalidateCredentials('tokens')
    expect(secrets.read().tokens).toBeDefined()

    await secrets.update({ tokensSavedAt: Date.now() - 60_000 })
    await provider.invalidateCredentials('tokens')
    expect(secrets.read().tokens).toBeUndefined()
  })

  it('клиент Slack app человека не стирается, свой зарегистрированный - да', async () => {
    const provider = new McpAuthProvider(secrets)

    await secrets.update({ client: { client_id: 'app', client_secret: 's' } })
    await provider.invalidateCredentials('client')
    expect(secrets.read().client).toBeDefined()

    await secrets.update({ client: { client_id: 'dcr' } })
    await provider.invalidateCredentials('client')
    expect(secrets.read().client).toBeUndefined()
  })

  it('срок токена считается от сохранения', async () => {
    const provider = new McpAuthProvider(secrets)

    await secrets.update({ tokens: { ...working, expires_in: 30 }, tokensSavedAt: Date.now() })
    expect(provider.expiresSoon()).toBe(true)
    await secrets.update({ tokens: working })
    expect(provider.expiresSoon()).toBe(false)
  })
})

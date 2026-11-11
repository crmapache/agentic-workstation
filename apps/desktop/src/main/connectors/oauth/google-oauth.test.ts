import { it, vi, expect, describe } from 'vitest'

import {
  hasScopes,
  googleAuthUrl,
  exchangeGoogleCode,
  refreshGoogleTokens,
  GoogleSignedOutError,
  parseGoogleClientFile,
  GoogleClientRejectedError,
} from './google-oauth'

const client = { clientId: 'id.apps.googleusercontent.com', clientSecret: 'shh' }

const previous = { refreshToken: 'rt', scope: '' }

const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('parseGoogleClientFile', () => {
  it('берёт клиент «приложение на компьютере»', () => {
    expect(
      parseGoogleClientFile({ installed: { client_id: 'a', client_secret: 'b', project_id: 'p' } }),
    ).toEqual({ clientId: 'a', clientSecret: 'b' })
  })

  it('веб-клиент - не тот тип, мусор - null', () => {
    expect(parseGoogleClientFile({ web: { client_id: 'a', client_secret: 'b' } })).toBe(
      'not-desktop-client',
    )
    expect(parseGoogleClientFile({ installed: { client_id: 'a' } })).toBeNull()
    expect(parseGoogleClientFile('x')).toBeNull()
  })
})

describe('googleAuthUrl', () => {
  it('просит офлайн-доступ, PKCE и выбор аккаунта', () => {
    const url = new URL(
      googleAuthUrl(client, {
        scopes: ['scope-a', 'scope-b'],
        state: 'st',
        challenge: 'ch',
        redirectUri: 'http://localhost:5319/callback',
      }),
    )

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: client.clientId,
      scope: 'scope-a scope-b',
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent select_account',
      redirect_uri: 'http://localhost:5319/callback',
    })
  })
})

describe('обмен и обновление токенов', () => {
  it('код меняется на токены с токеном обновления', async () => {
    const fetchFn = reply(200, { access_token: 'at', refresh_token: 'rt', expires_in: 10 })
    const tokens = await exchangeGoogleCode(client, 'code', 'ver', 'http://x', fetchFn)

    expect(tokens).toMatchObject({ accessToken: 'at', refreshToken: 'rt' })
    expect(fetchFn.mock.calls[0]?.[1]?.body).toContain('code_verifier=ver')
  })

  it('без токена обновления - отказ', async () => {
    await expect(
      exchangeGoogleCode(client, 'c', 'v', 'http://x', reply(200, { access_token: 'at' })),
    ).rejects.toThrow()
  })

  it('обновление сохраняет прежний токен обновления', async () => {
    const tokens = await refreshGoogleTokens(
      client,
      { refreshToken: 'rt', scope: 'a b' },
      reply(200, { access_token: 'new' }),
    )

    expect(tokens).toMatchObject({
      accessToken: 'new',
      refreshToken: 'rt',
      scope: 'a b',
      clientId: client.clientId,
    })
  })

  it('отозванный вход - GoogleSignedOutError', async () => {
    await expect(
      refreshGoogleTokens(client, previous, reply(400, { error: 'invalid_grant' })),
    ).rejects.toBeInstanceOf(GoogleSignedOutError)
  })

  it('отказ самому клиенту - GoogleClientRejectedError', async () => {
    await expect(
      refreshGoogleTokens(client, previous, reply(401, { error: 'invalid_client' })),
    ).rejects.toBeInstanceOf(GoogleClientRejectedError)
  })

  it('права проверяются все', () => {
    expect(hasScopes('a b c', ['a', 'c'])).toBe(true)
    expect(hasScopes('a', ['a', 'c'])).toBe(false)
  })
})

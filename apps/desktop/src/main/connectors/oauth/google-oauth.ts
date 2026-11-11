import { GOOGLE_OAUTH } from './oauth.constants'

/** Клиент OAuth Google «приложение на компьютере»: его ключ по правилам Google не секрет. */
export type GoogleClient = { clientId: string; clientSecret: string }

export type GoogleTokens = {
  accessToken: string
  refreshToken: string
  /** Когда истекает доступ, мс с эпохи. */
  expiresAt: number
  /** Права, которые человек выдал (через пробел): галочку на экране согласия можно снять. */
  scope: string
  /** Чьему клиенту выданы: с другим клиентом токен обновления не работает. */
  clientId: string
}

/** Вход отозван или истёк: нужен новый вход в браузере. */
export class GoogleSignedOutError extends Error {}

/** Google не принял сам клиент: ключ сбросили или клиента удалили в Cloud Console. */
export class GoogleClientRejectedError extends Error {}

/** Ответы, которыми Google отказывает клиенту, а не входу. */
const CLIENT_ERRORS = new Set(['invalid_client', 'unauthorized_client', 'deleted_client'])

type Fetch = typeof fetch

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Клиент из файла, скачанного в Cloud Console. Файл веб-клиента (`web`) не годится: у него
 * адреса возврата перечислены заранее, а IDE возвращается на localhost со своим портом.
 */
export const parseGoogleClientFile = (
  value: unknown,
): GoogleClient | 'not-desktop-client' | null => {
  if (!isRecord(value)) return null

  if (isRecord(value['web']) && !isRecord(value['installed'])) return 'not-desktop-client'

  const installed = value['installed']

  if (!isRecord(installed)) return null

  const clientId = installed['client_id']
  const clientSecret = installed['client_secret']

  if (typeof clientId !== 'string' || typeof clientSecret !== 'string') return null

  return { clientId, clientSecret }
}

export type GoogleAuthRequest = {
  scopes: readonly string[]
  state: string
  challenge: string
  redirectUri: string
}

/**
 * Адрес входа. access_type=offline и prompt=consent - чтобы Google точно выдал токен
 * обновления: без него вход умрёт через час. select_account - чтобы человек выбрал, какой
 * из своих аккаунтов подключает, а не получил тот, что открыт в браузере.
 */
export const googleAuthUrl = (client: GoogleClient, request: GoogleAuthRequest): string => {
  const url = new URL(GOOGLE_OAUTH.authorize)

  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: request.redirectUri,
    response_type: 'code',
    scope: request.scopes.join(' '),
    state: request.state,
    code_challenge: request.challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
  }).toString()

  return url.toString()
}

const tokenRequest = async (
  fetchFn: Fetch,
  params: Record<string, string>,
): Promise<Record<string, unknown>> => {
  const response = await fetchFn(GOOGLE_OAUTH.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const body: unknown = await response.json().catch(() => ({}))
  const record = isRecord(body) ? body : {}
  const error = typeof record['error'] === 'string' ? record['error'] : ''

  if (response.ok) return record

  // invalid_grant - токен обновления отозван (человек снял доступ, сменил пароль) или
  // истёк: это не сбой сети, а конец входа.
  if (error === 'invalid_grant') throw new GoogleSignedOutError('Вход Google отозван')

  if (CLIENT_ERRORS.has(error)) throw new GoogleClientRejectedError(`Клиент Google: ${error}`)

  throw new Error(`Google ответил ${response.status}: ${error}`)
}

const tokensFrom = (
  record: Record<string, unknown>,
  previous: Pick<GoogleTokens, 'refreshToken' | 'scope'>,
  clientId: string,
): GoogleTokens => {
  const accessToken = record['access_token']
  const expiresIn = record['expires_in']

  if (typeof accessToken !== 'string') throw new Error('Google не выдал токен доступа')

  return {
    accessToken,
    refreshToken:
      typeof record['refresh_token'] === 'string' ? record['refresh_token'] : previous.refreshToken,
    expiresAt: Date.now() + (typeof expiresIn === 'number' ? expiresIn : 3600) * 1000,
    scope: typeof record['scope'] === 'string' ? record['scope'] : previous.scope,
    clientId,
  }
}

/** Код из браузера - на токены. Без токена обновления вход бесполезен - это отказ. */
export const exchangeGoogleCode = async (
  client: GoogleClient,
  code: string,
  verifier: string,
  redirectUri: string,
  fetchFn: Fetch = fetch,
): Promise<GoogleTokens> => {
  const tokens = tokensFrom(
    await tokenRequest(fetchFn, {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    { refreshToken: '', scope: '' },
    client.clientId,
  )

  if (!tokens.refreshToken) throw new Error('Google не выдал токен обновления')

  return tokens
}

/** Обновить доступ. Новые права Google в ответе не всегда называет - тогда прежние. */
export const refreshGoogleTokens = async (
  client: GoogleClient,
  previous: Pick<GoogleTokens, 'refreshToken' | 'scope'>,
  fetchFn: Fetch = fetch,
): Promise<GoogleTokens> =>
  tokensFrom(
    await tokenRequest(fetchFn, {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: previous.refreshToken,
      grant_type: 'refresh_token',
    }),
    previous,
    client.clientId,
  )

/** Все ли нужные права выданы: человек мог снять галочку на экране согласия Google. */
export const hasScopes = (granted: string, required: readonly string[]): boolean => {
  const scopes = new Set(granted.split(/\s+/))

  return required.every((scope) => scopes.has(scope))
}

/** Отозвать вход у Google при удалении коннектора. Не вышло - не беда, токен у нас стёрт. */
export const revokeGoogleToken = async (token: string, fetchFn: Fetch = fetch): Promise<void> => {
  await fetchFn(GOOGLE_OAUTH.revoke, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  }).catch(() => undefined)
}

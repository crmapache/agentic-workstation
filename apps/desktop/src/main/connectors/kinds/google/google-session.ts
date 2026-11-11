import type { SecretsOf } from '../../connector-secrets'
import { SignedOutError } from '../../connector-source'
import {
  refreshGoogleTokens,
  GoogleSignedOutError,
  GoogleClientRejectedError,
} from '../../oauth/google-oauth'
import type { GoogleClient, GoogleTokens } from '../../oauth/google-oauth'
import { TOKEN_EXPIRY_MARGIN_MS } from '../../oauth/oauth.constants'

/** Ошибка API Google с его же объяснением: модель прочитает и поправит запрос. */
export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Клиента Google в IDE нет: вход не обновить и не начать. */
export class GoogleAppMissingError extends Error {}

/** Google не принял клиент IDE (ключ сбросили, клиента удалили): чинится в настройках. */
export class GoogleAppRejectedError extends Error {}

/** Чтение можно повторить: Google просит подождать (429) или споткнулся сам (5xx). */
const RETRY_STATUSES = new Set([429, 500, 502, 503])

/** Паузы перед повторами чтения. */
const RETRY_DELAYS_MS = [500, 1500]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type GoogleRequest = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | readonly string[] | undefined>
  body?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const urlWith = (base: string, query: GoogleRequest['query'] = {}): string => {
  const url = new URL(base)

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue

    for (const item of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, String(item))
    }
  }

  return url.toString()
}

/** Текст ошибки Google: `error.message`, а если его нет - код ответа. */
const errorMessage = (status: number, body: unknown): string => {
  const error = isRecord(body) ? body['error'] : null
  const message = isRecord(error) ? error['message'] : null

  return typeof message === 'string' ? message : `Google API answered ${status}`
}

/**
 * Вход Google одного коннектора и запросы к API от его имени. Токен доступа обновляется
 * заранее, за минуту до срока, и одним запросом на всех: десяток параллельных вызовов не
 * пойдут обновлять токен десять раз. Ответ 401 - ещё одна попытка со свежим токеном,
 * чтение после 429 и 5xx - ещё две с паузой.
 */
export class GoogleSession {
  private refreshing: Promise<string> | null = null

  constructor(
    private readonly secrets: SecretsOf,
    private readonly client: () => GoogleClient | null,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async request<T = unknown>(url: string, request: GoogleRequest = {}): Promise<T> {
    const method = request.method ?? 'GET'
    const send = async (token: string) =>
      this.fetchFn(urlWith(url, request.query), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      })

    let response = await send(await this.token())

    if (response.status === 401) response = await send(await this.token(true))

    // Повторяется только чтение: запись могла пройти, и повтор сделал бы её дважды.
    for (const pause of method === 'GET' ? RETRY_DELAYS_MS : []) {
      if (!RETRY_STATUSES.has(response.status)) break

      await delay(pause)
      response = await send(await this.token())
    }

    if (response.status === 204) return undefined as T

    const body: unknown = await response.json().catch(() => null)

    if (!response.ok) throw new GoogleApiError(response.status, errorMessage(response.status, body))

    return body as T
  }

  /** Живой токен доступа; force - обновить, даже если срок не вышел. */
  token(force = false): Promise<string> {
    const tokens = this.secrets.read().google
    const client = this.client()

    if (!tokens) return Promise.reject(new SignedOutError('Нет входа Google'))

    // Вход выдан другому клиенту: обновить его этот клиент не сможет, нужен новый вход.
    if (client && tokens.clientId !== client.clientId) {
      return Promise.reject(new SignedOutError('Вход Google выдан другому клиенту'))
    }

    if (!force && tokens.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()) {
      return Promise.resolve(tokens.accessToken)
    }

    this.refreshing ??= this.refresh(tokens).finally(() => {
      this.refreshing = null
    })

    return this.refreshing
  }

  private async refresh(previous: GoogleTokens): Promise<string> {
    const client = this.client()

    if (!client) throw new GoogleAppMissingError('Нет клиента Google')

    try {
      const tokens = await refreshGoogleTokens(client, previous, this.fetchFn)

      await this.secrets.update({ google: tokens })

      return tokens.accessToken
    } catch (error) {
      if (error instanceof GoogleClientRejectedError)
        throw new GoogleAppRejectedError(error.message)

      if (!(error instanceof GoogleSignedOutError)) throw error

      // Стереть, только если в хранилище всё ещё тот вход, которому отказали: новый вход,
      // сделанный за это время, не трогаем.
      if (this.secrets.read().google?.refreshToken === previous.refreshToken) {
        await this.secrets.update({ google: undefined })
      }

      throw new SignedOutError('Вход Google отозван')
    }
  }
}

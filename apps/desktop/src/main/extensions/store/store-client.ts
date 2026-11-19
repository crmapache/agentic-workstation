import { createHash } from 'node:crypto'

import type { StoreSort, StoreResult, StoreFailure, StoreIdentity } from '@shared/extension-store'

import type {
  Published,
  ReviewPage,
  ListingPage,
  ListingDetail,
} from '@agentic-workstation/store-protocol/api'
import { signedHeaders } from '@agentic-workstation/store-protocol/node-signer'
import type { StoreKeys } from '@agentic-workstation/store-protocol/node-signer'
import { canonicalJson } from '@agentic-workstation/store-protocol/package-format'

/** Сколько ждать ответа магазина. */
const STORE_TIMEOUT_MS = 20_000

const KNOWN_FAILURES: readonly StoreFailure[] = [
  'not-found',
  'not-owner',
  'version-exists',
  'rate-limited',
  'not-installed',
  'own-extension',
  'too-large',
  'bad-request',
]

type Fetch = typeof fetch

const failed = <T>(error: StoreFailure, message: string): StoreResult<T> => ({
  ok: false,
  error,
  message,
})

/**
 * Клиент магазина расширений (ADR 0091): чтение - открыто, запись - с подписью ключом этой IDE.
 * Ответ - значение или причина словами окна; сеть недоступна - offline, а не исключение.
 */
export class StoreClient {
  constructor(
    private readonly base: string,
    private readonly keys: () => Promise<StoreKeys | null>,
    private readonly fetcher: Fetch = fetch,
  ) {}

  list(query: { q: string; sort: StoreSort; offset: number }): Promise<StoreResult<ListingPage>> {
    const params = new URLSearchParams({
      q: query.q,
      sort: query.sort,
      offset: String(query.offset),
      limit: '24',
    })

    return this.read(`/v1/extensions?${params.toString()}`)
  }

  pick(ids: readonly string[]): Promise<StoreResult<ListingPage>> {
    return this.read(`/v1/extensions?ids=${ids.map(encodeURIComponent).join(',')}`)
  }

  detail(id: string): Promise<StoreResult<ListingDetail>> {
    return this.read(`/v1/extensions/${encodeURIComponent(id)}`)
  }

  reviews(id: string, offset: number): Promise<StoreResult<ReviewPage>> {
    return this.read(`/v1/extensions/${encodeURIComponent(id)}/reviews?offset=${offset}&limit=20`)
  }

  /** Пакет версии: отпечаток канонического JSON должен совпасть с тем, что обещал магазин. */
  async download(id: string, version: string, digest: string): Promise<StoreResult<unknown>> {
    const read = await this.read<unknown>(
      `/v1/extensions/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
    )

    if (!read.ok) return read

    const actual = createHash('sha256').update(canonicalJson(read.value)).digest('hex')

    return actual === digest
      ? read
      : failed('digest-mismatch', `The package of ${id} ${version} does not match its digest.`)
  }

  publish(id: string, pkg: unknown): Promise<StoreResult<Published>> {
    return this.write('POST', `/v1/extensions/${encodeURIComponent(id)}/versions`, pkg)
  }

  recordInstall(id: string, version: string): Promise<StoreResult<unknown>> {
    return this.write('POST', `/v1/extensions/${encodeURIComponent(id)}/installs`, { version })
  }

  review(id: string, rating: number, text: string): Promise<StoreResult<unknown>> {
    return this.write('PUT', `/v1/extensions/${encodeURIComponent(id)}/reviews`, { rating, text })
  }

  report(id: string, reason: string): Promise<StoreResult<unknown>> {
    return this.write('POST', `/v1/extensions/${encodeURIComponent(id)}/reports`, { reason })
  }

  unpublish(id: string): Promise<StoreResult<unknown>> {
    return this.write('DELETE', `/v1/extensions/${encodeURIComponent(id)}`, undefined)
  }

  me(): Promise<StoreResult<StoreIdentity>> {
    return this.write('GET', '/v1/me', undefined)
  }

  rename(name: string): Promise<StoreResult<StoreIdentity>> {
    return this.write('PUT', '/v1/me', { name })
  }

  private read<T>(path: string): Promise<StoreResult<T>> {
    return this.request<T>('GET', path, undefined, {})
  }

  private async write<T>(method: string, path: string, body: unknown): Promise<StoreResult<T>> {
    const keys = await this.keys()

    if (!keys)
      return failed(
        'no-keychain',
        'The keychain is not available, so the IDE cannot sign for the store.',
      )

    const text = body === undefined ? '' : JSON.stringify(body)

    return this.request<T>(
      method,
      path,
      body === undefined ? undefined : text,
      signedHeaders(keys, { method, path, body: text }),
    )
  }

  private async request<T>(
    method: string,
    path: string,
    body: string | undefined,
    headers: Record<string, string>,
  ): Promise<StoreResult<T>> {
    let response: Response

    try {
      response = await this.fetcher(`${this.base}${path}`, {
        method,
        ...(body === undefined ? {} : { body }),
        headers: {
          ...headers,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
      })
    } catch (error) {
      return failed('offline', error instanceof Error ? error.message : String(error))
    }

    let json: unknown

    try {
      json = await response.json()
    } catch {
      json = null
    }

    if (response.ok) return { ok: true, value: json as T }

    const record =
      typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
    const code = typeof record['error'] === 'string' ? record['error'] : ''
    const message =
      typeof record['message'] === 'string' ? record['message'] : `HTTP ${response.status}`

    // Подпись не сошлась или опоздала - почти всегда часы компьютера ушли.
    if (code === 'unsigned' || code === 'bad-signature') return failed('bad-signature', message)

    return failed(
      KNOWN_FAILURES.includes(code as StoreFailure) ? (code as StoreFailure) : 'server',
      message,
    )
  }
}

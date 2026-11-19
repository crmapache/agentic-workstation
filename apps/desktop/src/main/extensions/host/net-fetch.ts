import { HostArgError } from './host-args'
import type { NetResponse } from './host-types'

/** Сколько ждать ответа, сколько перенаправлений пройти и сколько тела прочитать. */
const FETCH_TIMEOUT_MS = 30_000
const REDIRECTS_MAX = 5
const BODY_MAX_BYTES = 5 * 1024 * 1024

/**
 * Запрос расширения в сеть (ADR 0091): только к разрешённым хостам, и каждое перенаправление -
 * тоже; без куки браузера и чужих входов; тело ответа - текстом не больше 5 МБ.
 */
export const extensionFetch = async (
  start: URL,
  init: { method: string; headers: Record<string, string>; body: string | null },
  allowed: (hostname: string) => boolean,
): Promise<NetResponse> => {
  let url = start
  let method = init.method
  let body = init.body

  for (let hop = 0; hop <= REDIRECTS_MAX; hop += 1) {
    const response = await fetch(url, {
      method,
      headers: init.headers,
      body: method === 'GET' || method === 'HEAD' ? null : body,
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const location = response.headers.get('location')

    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, url)

      if ((next.protocol !== 'https:' && next.protocol !== 'http:') || !allowed(next.hostname)) {
        throw new HostArgError(
          `The answer redirects to "${next.hostname}", which is not in network.hosts.`,
        )
      }

      // 303 и POST после 301/302 - как браузер: дальше GET без тела.
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && method === 'POST')
      ) {
        method = 'GET'
        body = null
      }

      url = next
      continue
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers),
      body: await limitedText(response),
    }
  }

  throw new HostArgError('Too many redirects.')
}

const limitedText = async (response: Response): Promise<string> => {
  if (!response.body) return ''

  const reader = (response.body as ReadableStream<Uint8Array>).getReader()
  const chunks: Uint8Array[] = []
  let size = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) break

    size += value.byteLength

    if (size > BODY_MAX_BYTES) {
      await reader.cancel()
      throw new HostArgError('The answer is larger than 5 MB.')
    }

    chunks.push(value)
  }

  return Buffer.concat(chunks).toString('utf8')
}

import { createHash, timingSafeEqual } from 'node:crypto'

import type { ListingSort } from '@agentic-workstation/store-protocol/api'
import { VERSION, EXTENSION_ID } from '@agentic-workstation/store-protocol/package-format'

import type { Signer, SignatureDesk } from './auth.ts'
import type { Catalog } from './catalog.ts'
import type { Ledger } from './ledger.ts'
import { LedgerError } from './ledger.ts'

/** Запрос, разобранный сервером: путь без запроса, параметры, сырое тело. */
export type StoreRequest = {
  method: string
  /** Путь с запросом - то, что подписывает IDE. */
  url: string
  path: string
  query: URLSearchParams
  headers: Record<string, string | string[] | undefined>
  body: Buffer
}

/** Ответ: JSON или текст пакета со своими заголовками. */
export type StoreResponse = {
  status: number
  json?: unknown
  text?: string
  headers?: Record<string, string>
}

type Handler = (request: StoreRequest, params: string[]) => StoreResponse

export type RouteDeps = {
  catalog: Catalog
  ledger: Ledger
  signatures: SignatureDesk
  adminToken: string
  /** Можно ли этому ключу опубликовать ещё раз сейчас (предел в час). */
  mayPublish: (key: string) => boolean
}

const ok = (json: unknown, status = 200): StoreResponse => ({ status, json })

const fail = (status: number, error: string, message: string): StoreResponse => ({
  status,
  json: { error, message },
})

const intIn = (value: string | null, min: number, max: number, fallback: number) => {
  const parsed = Number(value)

  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

const jsonBody = (request: StoreRequest): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(request.body.toString('utf8') || '{}')

    if (typeof value === 'object' && value !== null && !Array.isArray(value))
      return value as Record<string, unknown>
  } catch {
    // ниже - отказ словами
  }

  throw new LedgerError('bad-request', 'The body must be a JSON object.')
}

/** Строковое поле тела; не строка - пусто. */
const field = (body: Record<string, unknown>, name: string): string => {
  const value = body[name]

  return typeof value === 'string' ? value : ''
}

const sameSecret = (given: string, expected: string): boolean => {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()

  return expected !== '' && timingSafeEqual(a, b)
}

/**
 * Маршруты магазина. Чтение - без подписи; запись - только подписанная ключом IDE, а её право
 * (владелец, ставил ли, своё ли) проверяет Ledger. Ошибка записи - код и слова, а не 500.
 */
export const createRoutes = (deps: RouteDeps): ((request: StoreRequest) => StoreResponse) => {
  const signed =
    (run: (request: StoreRequest, params: string[], signer: Signer) => StoreResponse): Handler =>
    (request, params) => {
      const check = deps.signatures.check({
        method: request.method,
        path: request.url,
        headers: request.headers,
        body: request.body,
      })

      if (!check.ok) return fail(401, check.error, 'Sign the request with the IDE key.')

      return run(request, params, check.signer)
    }

  const isAdmin = (request: StoreRequest) => {
    const header = request.headers['authorization']

    return (
      typeof header === 'string' &&
      header.startsWith('Bearer ') &&
      sameSecret(header.slice(7), deps.adminToken)
    )
  }

  const routes: [string, RegExp, Handler][] = [
    [
      'GET',
      /^\/v1\/extensions$/,
      (request) => {
        const ids = request.query.get('ids')

        if (ids !== null) {
          const wanted = [...new Set(ids.split(','))]
            .filter((id) => EXTENSION_ID.test(id))
            .slice(0, 100)

          return ok({ items: deps.catalog.pick(wanted), total: wanted.length })
        }

        const sortParam = request.query.get('sort')
        const sort: ListingSort =
          sortParam === 'rating' || sortParam === 'new' ? sortParam : 'popular'

        return ok(
          deps.catalog.page({
            q: (request.query.get('q') ?? '').trim().slice(0, 100),
            sort,
            offset: intIn(request.query.get('offset'), 0, 100_000, 0),
            limit: intIn(request.query.get('limit'), 1, 50, 24),
          }),
        )
      },
    ],
    [
      'GET',
      /^\/v1\/extensions\/([a-z][a-z0-9-]{1,39})$/,
      (_request, [id = '']) => {
        const detail = deps.catalog.detail(id)

        return detail ? ok(detail) : fail(404, 'not-found', `No extension "${id}".`)
      },
    ],
    [
      'GET',
      /^\/v1\/extensions\/([a-z][a-z0-9-]{1,39})\/versions\/([0-9A-Za-z.-]{5,60})$/,
      (_request, [id = '', version = '']) => {
        const pkg = deps.catalog.package(id, version)

        return pkg
          ? {
              status: 200,
              text: pkg.text,
              headers: { 'content-type': 'application/json', 'x-aw-digest': pkg.digest },
            }
          : fail(404, 'not-found', `No version ${version} of "${id}".`)
      },
    ],
    [
      'GET',
      /^\/v1\/extensions\/([a-z][a-z0-9-]{1,39})\/reviews$/,
      (request, [id = '']) =>
        ok(
          deps.ledger.reviews(
            id,
            intIn(request.query.get('offset'), 0, 100_000, 0),
            intIn(request.query.get('limit'), 1, 50, 20),
          ),
        ),
    ],
    [
      'POST',
      /^\/v1\/extensions\/([a-z][a-z0-9-]{1,39})\/versions$/,
      signed((request, [id = ''], signer) => {
        if (!EXTENSION_ID.test(id)) return fail(400, 'bad-request', 'Bad extension id.')
        if (!deps.mayPublish(signer.key))
          return fail(429, 'rate-limited', 'Too many publications, try later.')

        return ok(deps.ledger.publish(signer, id, jsonBody(request)), 201)
      }),
    ],
    [
      'POST',
      /^\/v1\/extensions\/([a-z][a-z0-9-]{1,39})\/installs$/,
      signed((request, [id = ''], signer) => {
        const version = field(jsonBody(request), 'version')

        if (!VERSION.test(version)) return fail(400, 'bad-request', 'Bad version.')

        deps.ledger.install(signer, id, version)

        return ok({ ok: true })
      }),
    ],
    [
      'PUT',
      /^\/v1\/extensions\/([a-z][a-z0-9-]{1,39})\/reviews$/,
      signed((request, [id = ''], signer) => {
        const body = jsonBody(request)

        deps.ledger.review(signer, id, Number(body['rating']), field(body, 'text'))

        return ok({ ok: true })
      }),
    ],
    [
      'DELETE',
      /^\/v1\/extensions\/([a-z][a-z0-9-]{1,39})\/reviews$/,
      signed((_request, [id = ''], signer) => {
        deps.ledger.unreview(signer, id)

        return ok({ ok: true })
      }),
    ],
    [
      'POST',
      /^\/v1\/extensions\/([a-z][a-z0-9-]{1,39})\/reports$/,
      signed((request, [id = ''], signer) => {
        deps.ledger.report(signer, id, field(jsonBody(request), 'reason'))

        return ok({ ok: true })
      }),
    ],
    [
      'DELETE',
      /^\/v1\/extensions\/([a-z][a-z0-9-]{1,39})$/,
      (request, params) => {
        if (isAdmin(request)) {
          deps.ledger.hide(params[0] ?? '', null)

          return ok({ ok: true })
        }

        return signed((_inner, [id = ''], signer) => {
          deps.ledger.hide(id, signer)

          return ok({ ok: true })
        })(request, params)
      },
    ],
    [
      'GET',
      /^\/v1\/me$/,
      signed((_request, _params, signer) => ok(deps.catalog.publisher(signer.key))),
    ],
    [
      'PUT',
      /^\/v1\/me$/,
      signed((request, _params, signer) => {
        deps.ledger.rename(signer, field(jsonBody(request), 'name'))

        return ok(deps.catalog.publisher(signer.key))
      }),
    ],
  ]

  return (request) => {
    for (const [method, pattern, handler] of routes) {
      const match = pattern.exec(request.path)

      if (!match || method !== request.method) continue

      try {
        return handler(request, match.slice(1))
      } catch (error) {
        if (error instanceof LedgerError)
          return fail(statusOf(error.code), error.code, error.message)

        throw error
      }
    }

    return fail(404, 'not-found', 'No such address.')
  }
}

const statusOf = (code: LedgerError['code']): number =>
  ({
    'not-found': 404,
    'not-owner': 403,
    'own-extension': 403,
    'not-installed': 403,
    'version-exists': 409,
    'rate-limited': 429,
  })[code as string] ?? 400

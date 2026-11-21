import type {
  CloudError,
  PullResponse,
  PushResponse,
  CloudErrorCode,
} from '@agentic-workstation/cloud-protocol/api'
import { MAX_WAIT_SECONDS, pushRequestSchema } from '@agentic-workstation/cloud-protocol/api'

import type { Signer, SignatureDesk } from './auth.ts'
import type { Records } from './records.ts'
import { Refusal } from './records.ts'
import type { Waiters } from './waiters.ts'

/** Запрос, разобранный сервером. */
export type CloudRequest = {
  method: string
  /** Путь с запросом ровно как пришёл: его подписывает IDE. */
  url: string
  path: string
  query: URLSearchParams
  headers: Record<string, string | string[] | undefined>
  body: Buffer
  /** Отмена: клиент ушёл или сервер гаснет - ответ отдавать уже некому. */
  signal: AbortSignal
}

export type CloudResponse = { status: number; json: unknown }

/** Ответ или null - клиента уже нет, отвечать некому. */
type Reply = CloudResponse | null

type Handler = (request: CloudRequest, signer: Signer) => Reply | Promise<Reply>

export type RouteDeps = {
  records: Records
  signatures: SignatureDesk
  waiters: Waiters
  /** Можно ли этому аккаунту ещё запрос сейчас (предел в минуту со всех его компьютеров). */
  mayCall: (key: string) => boolean
  log: (line: string) => void
}

const STATUS: Record<CloudErrorCode, number> = {
  'bad-request': 400,
  unsigned: 401,
  'bad-signature': 401,
  'not-found': 404,
  'too-large': 413,
  'rate-limited': 429,
  server: 500,
  // Insufficient Storage: место аккаунта кончилось, повтор той же пачки не поможет.
  'account-full': 507,
}

/** Отказ протокола: код и слова для журнала IDE, статус HTTP - по коду. */
export const failure = (error: CloudErrorCode, message: string): CloudResponse => ({
  status: STATUS[error],
  json: { error, message } satisfies CloudError,
})

const ok = (json: PushResponse | PullResponse): CloudResponse => ({ status: 200, json })

/**
 * Целое из параметра запроса: нет параметра - fallback; не целое из [0, max] - null. Не
 * подрезаем молча: IDE со сломанным счётчиком должна узнать об этом отказом, а не странной
 * страницей.
 */
const intParam = (
  query: URLSearchParams,
  name: string,
  max: number,
  fallback: number,
): number | null => {
  const value = query.get(name)

  if (value === null) return fallback
  if (!/^\d{1,16}$/.test(value)) return null

  const parsed = Number(value)

  return parsed <= max ? parsed : null
}

const jsonOf = (body: Buffer): unknown => {
  try {
    return JSON.parse(body.toString('utf8')) as unknown
  } catch {
    throw new Refusal('bad-request', 'The body must be JSON.')
  }
}

/**
 * Маршруты облака: только подписанные. Подпись и есть аккаунт - отдельного входа нет, и чужие
 * записи не адресовать: ключ аккаунта в запросе - всегда ключ подписавшего.
 */
export const createRoutes = (deps: RouteDeps): ((request: CloudRequest) => Promise<Reply>) => {
  const signed =
    (handler: Handler) =>
    (request: CloudRequest): Reply | Promise<Reply> => {
      const check = deps.signatures.check({
        method: request.method,
        path: request.url,
        headers: request.headers,
        body: request.body,
      })

      if (!check.ok) return failure(check.error, 'Sign the request with the account key.')

      // Предел на аккаунт - после подписи: иначе чужой ключ в заголовке выбирал бы его предел.
      if (!deps.mayCall(check.signer.key))
        return failure('rate-limited', 'Too many requests for this account, try later.')

      if (deps.records.touch(check.signer.key)) deps.log(`новый аккаунт ${check.signer.id}`)

      return handler(request, check.signer)
    }

  const push: Handler = (request, signer) => {
    const parsed = pushRequestSchema.safeParse(jsonOf(request.body))

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue?.path.map(String).join('.') || 'body'

      return failure('bad-request', `${where}: ${issue?.message ?? 'invalid'}`)
    }

    try {
      const response = deps.records.push(signer.key, parsed.data.records)

      if (response.results.some((result) => result.ok)) deps.waiters.wake(signer.key)

      return ok(response)
    } catch (error) {
      if (error instanceof Refusal && error.code === 'account-full')
        deps.log(`аккаунт ${signer.id} полон: ${error.message}`)

      throw error
    }
  }

  const pull: Handler = async (request, signer) => {
    const since = intParam(request.query, 'since', Number.MAX_SAFE_INTEGER, 0)
    const wait = intParam(request.query, 'wait', MAX_WAIT_SECONDS, 0)

    if (since === null || wait === null) {
      return failure(
        'bad-request',
        `since is a whole number from 0, wait - a whole number of seconds from 0 to ${MAX_WAIT_SECONDS}.`,
      )
    }

    const page = deps.records.pull(signer.key, since)

    // IDE впереди сервера (база поднята из бэкапа) - ждать нечего: пусть сразу увидит меньшую
    // версию и заберёт всё заново.
    if (page.records.length > 0 || wait === 0 || since > page.rev) return ok(page)

    const woken = deps.waiters.wait(signer.key, wait * 1000, request.signal)

    // Мест ждать нет - отвечаем пустой страницей сразу, IDE спросит снова.
    if (!woken) return ok(page)

    await woken

    return request.signal.aborted ? null : ok(deps.records.pull(signer.key, since))
  }

  const routes = new Map<string, (request: CloudRequest) => Reply | Promise<Reply>>([
    ['POST /v1/push', signed(push)],
    ['GET /v1/pull', signed(pull)],
  ])

  return async (request) => {
    const route = routes.get(`${request.method} ${request.path}`)

    if (!route) return failure('not-found', 'No such address.')

    try {
      return await route(request)
    } catch (error) {
      if (error instanceof Refusal) return failure(error.code, error.message)

      throw error
    }
  }
}

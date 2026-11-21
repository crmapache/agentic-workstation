import type { IncomingHttpHeaders } from 'node:http'

import { MAX_WAIT_SECONDS, pushRequestSchema } from '@agentic-workstation/cloud-protocol/api'

import type { Signer, SignatureDesk, SignatureRefusal } from './auth.ts'
import type { Take } from './rate-limit.ts'
import type { Records } from './records.ts'
import type { CloudResponse } from './replies.ts'
import { ok, busy, failure, Refusal, limitRefusal } from './replies.ts'
import type { Waiters } from './waiters.ts'

/** Голова запроса - всё, что известно до чтения тела. */
export type CloudHead = {
  method: string
  /** Путь с запросом ровно как пришёл: его подписывает IDE. */
  url: string
  path: string
  query: URLSearchParams
  /** Заголовок Host: его подписывает IDE (cloud-protocol/signing). */
  host: string
  headers: IncomingHttpHeaders
  /** Корзина адреса звонящего (callers.ts); ANONYMOUS - честно не сказать. */
  caller: string
  /** Сколько тела обещают заголовки (body.ts). */
  body: number | 'unknown'
  /** Отмена: клиент ушёл или сервер гаснет - ответ отдавать уже некому. */
  signal: AbortSignal
}

/** Ответ или null - клиента уже нет, отвечать некому. */
type Reply = CloudResponse | null

/**
 * Решение до чтения тела: отказ сразу или «читай тело» - сколько места под него занять в памяти
 * и что сделать с прочитанным.
 */
export type Admission =
  | { kind: 'refuse'; reply: CloudResponse }
  | { kind: 'read'; reserve: number; run: (body: Buffer) => Promise<Reply> }

type Handler = (head: CloudHead, body: Buffer, signer: Signer) => Reply | Promise<Reply>

/** Маршрут: метод, обработчик и пишет ли он в базу (тогда нужен запас диска). */
type Route = { method: 'GET' | 'POST'; handler: Handler; writes: boolean }

export type RouteDeps = {
  records: Records
  signatures: SignatureDesk
  waiters: Waiters
  maxBodyBytes: number
  /** Предел частоты с адреса звонящего: чтение и запись отдельно. */
  fromCaller: (caller: string, method: string) => Take
  /** Предел частоты на аккаунт со всех его компьютеров. */
  forAccount: (key: string) => Take
  /** Можно ли с этого адреса завести ещё один аккаунт. */
  newAccount: (caller: string) => Take
  /** Хватает ли места на диске базы, чтобы принять запись. */
  hasRoom: () => boolean
  log: (line: string) => void
}

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

const signatureFailure = (refusal: SignatureRefusal): CloudResponse =>
  refusal.error === 'overloaded'
    ? busy()
    : failure(refusal.error, 'Sign the request with the account key.')

/**
 * Маршруты облака: только подписанные. Подпись и есть аккаунт - отдельного входа нет, и чужие
 * записи не адресовать: ключ аккаунта в запросе - всегда ключ подписавшего.
 *
 * Всё, что видно по заголовкам, решается до чтения тела: адрес и метод, тело у GET, заявленная
 * длина, форма и свежесть подписи, повтор разового числа, место на диске. Тело читает и держит
 * в памяти только запрос, у которого есть шанс пройти.
 */
export const createRoutes = (deps: RouteDeps): ((head: CloudHead) => Admission) => {
  const push: Handler = (head, body, signer) => {
    const parsed = pushRequestSchema.safeParse(jsonOf(body))

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue?.path.map(String).join('.') || 'body'

      return failure('bad-request', `${where}: ${issue?.message ?? 'invalid'}`)
    }

    try {
      const { response, created } = deps.records.push(signer.key, parsed.data.records, () => {
        const take = deps.newAccount(head.caller)

        if (take !== 'ok')
          throw limitRefusal(take, 'Too many new accounts from this address, try later.')
      })

      if (created) deps.log(`новый аккаунт ${signer.id}`)
      if (response.results.some((result) => result.ok)) deps.waiters.wake(signer.key)

      return ok(response)
    } catch (error) {
      if (error instanceof Refusal && error.code === 'account-full')
        deps.log(`аккаунт ${signer.id} полон: ${error.message}`)

      throw error
    }
  }

  const pull: Handler = async (head, _body, signer) => {
    const since = intParam(head.query, 'since', Number.MAX_SAFE_INTEGER, 0)
    const wait = intParam(head.query, 'wait', MAX_WAIT_SECONDS, 0)

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

    const woken = deps.waiters.wait(signer.key, head.caller, wait * 1000, head.signal)

    // Мест ждать нет - отвечаем пустой страницей сразу, IDE спросит снова.
    if (!woken) return ok(page)

    await woken

    return head.signal.aborted ? null : ok(deps.records.pull(signer.key, since))
  }

  const routes = new Map<string, Route>([
    ['/v1/push', { method: 'POST', handler: push, writes: true }],
    ['/v1/pull', { method: 'GET', handler: pull, writes: false }],
  ])

  /** С прочитанным телом: подпись целиком, предел аккаунта, обработчик. */
  const run =
    (route: Route, head: CloudHead) =>
    async (body: Buffer): Promise<Reply> => {
      const check = deps.signatures.check(head, body)

      if (!check.ok) return signatureFailure(check)

      // Предел на аккаунт - после подписи: иначе чужой ключ в заголовке выбирал бы его предел.
      const take = deps.forAccount(check.signer.key)

      if (take !== 'ok')
        return limitRefusal(take, 'Too many requests for this account, try later.').reply

      deps.records.see(check.signer.key)

      try {
        return await route.handler(head, body, check.signer)
      } catch (error) {
        if (error instanceof Refusal) return error.reply

        throw error
      }
    }

  const refuse = (reply: CloudResponse): Admission => ({ kind: 'refuse', reply })

  return (head) => {
    const take = deps.fromCaller(head.caller, head.method)

    if (take !== 'ok') return refuse(limitRefusal(take, 'Too many requests, try later.').reply)

    const route = routes.get(head.path)

    if (!route) return refuse(failure('not-found', 'No such address.'))

    if (route.method !== head.method) {
      return refuse({
        ...failure('method-not-allowed', `${head.path} takes ${route.method} only.`),
        headers: { allow: route.method },
      })
    }

    if (route.method === 'GET' && head.body !== 0)
      return refuse(failure('bad-request', 'A GET request carries no body.'))

    if (head.body !== 'unknown' && head.body > deps.maxBodyBytes)
      return refuse(failure('too-large', `The body is over ${deps.maxBodyBytes} bytes.`))

    const signed = deps.signatures.precheck(head)

    if (!signed.ok) return refuse(signatureFailure(signed))

    if (route.writes && !deps.hasRoom())
      return refuse(failure('server-full', 'The server is out of disk space, try later.'))

    return {
      kind: 'read',
      // Без заявленной длины место занимается под самое большое тело.
      reserve: head.body === 'unknown' ? deps.maxBodyBytes : head.body,
      run: run(route, head),
    }
  }
}

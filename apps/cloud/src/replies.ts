import type {
  CloudError,
  PullResponse,
  PushResponse,
  CloudErrorCode,
} from '@agentic-workstation/cloud-protocol/api'

import type { Take } from './rate-limit.ts'

/** Ответ сервера: статус, тело JSON и, если нужно, свои заголовки. */
export type CloudResponse = { status: number; json: unknown; headers?: Record<string, string> }

const STATUS: Record<CloudErrorCode, number> = {
  'bad-request': 400,
  unsigned: 401,
  'bad-signature': 401,
  'not-found': 404,
  'method-not-allowed': 405,
  'too-large': 413,
  'rate-limited': 429,
  server: 500,
  // Insufficient Storage: место аккаунта кончилось, повтор той же пачки не поможет.
  'account-full': 507,
  // Тот же статус, но кончился диск сервера - не вина аккаунта; IDE различает по коду.
  'server-full': 507,
}

/** Перегрузка - тот же код server, но 503: временно, повторить позже. */
const BUSY = 503

/** Отказ протокола: код и слова для журнала IDE, статус HTTP - по коду (или свой, как 503). */
export const failure = (
  error: CloudErrorCode,
  message: string,
  status: number = STATUS[error],
): CloudResponse => ({ status, json: { error, message } satisfies CloudError })

export const ok = (json: PushResponse | PullResponse): CloudResponse => ({ status: 200, json })

/** Сервер перегружен (память, таблицы пределов): 503 с кодом server. */
export const busy = (): CloudResponse => failure('server', 'The server is busy, try later.', BUSY)

/** Отказ запроса целиком изнутри обработки: код протокола, слова для журнала IDE, статус. */
export class Refusal extends Error {
  readonly code: CloudErrorCode
  readonly status: number | undefined

  constructor(code: CloudErrorCode, message: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
  }

  get reply(): CloudResponse {
    return failure(this.code, this.message, this.status)
  }
}

/** Отказ по пределу частоты: свой предел кончился - 429, таблица пределов полна - 503. */
export const limitRefusal = (take: Exclude<Take, 'ok'>, message: string): Refusal =>
  take === 'limited'
    ? new Refusal('rate-limited', message)
    : new Refusal('server', 'The server is busy, try later.', BUSY)

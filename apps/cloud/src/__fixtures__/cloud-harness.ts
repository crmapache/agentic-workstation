import { rmSync, mkdtempSync } from 'node:fs'
import type { IncomingHttpHeaders } from 'node:http'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach } from 'vitest'

import type {
  PushRecord,
  PullResponse,
  PushResponse,
} from '@agentic-workstation/cloud-protocol/api'
import {
  MAX_PUSH_BYTES,
  PULL_PAGE_BYTES,
  MAX_ACCOUNT_BYTES,
  MAX_ACCOUNT_RECORDS,
} from '@agentic-workstation/cloud-protocol/api'
import type { CloudAccount } from '@agentic-workstation/cloud-protocol/node-account'
import { accountOf } from '@agentic-workstation/cloud-protocol/node-account'
import { sealRecord } from '@agentic-workstation/cloud-protocol/node-seal'
import { signedHeaders } from '@agentic-workstation/cloud-protocol/node-signer'

import type { Config } from '../config.ts'
import { DATABASE_FILE } from '../db.ts'
import type { Cloud } from '../server.ts'
import { createCloud } from '../server.ts'

/**
 * Облако на настоящем HTTP для проверок: свой порт и своя папка базы на каждый тест, пределы
 * частоты - так широко, чтобы не мешали, пока тест не сузит нужный.
 */
export const TEST_CONFIG: Omit<Config, 'dataDir'> = {
  port: 0,
  build: 'test',
  trustProxy: false,
  readsPerMinute: 100_000,
  writesPerMinute: 100_000,
  accountRequestsPerMinute: 100_000,
  newAccountsPerDay: 100_000,
  maxBodyBytes: MAX_PUSH_BYTES,
  maxBodyMemoryBytes: 64 * 1024 * 1024,
  maxAccountRecords: MAX_ACCOUNT_RECORDS,
  maxAccountBytes: MAX_ACCOUNT_BYTES,
  pullPageBytes: PULL_PAGE_BYTES,
  minFreeDiskBytes: 0,
  maxWaitsPerAccount: 8,
  maxWaitsPerCaller: 16,
  maxWaits: 1000,
  headersTimeoutMs: 10_000,
  requestTimeoutMs: 30_000,
  maxNonces: 100_000,
  maxTrackedKeys: 100_000,
}

/** Два компьютера с одним ключом аккаунта и чужой аккаунт. */
export const laptop = accountOf(Buffer.alloc(32, 1))
export const desktop = accountOf(Buffer.alloc(32, 1))
export const stranger = accountOf(Buffer.alloc(32, 2))

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const idOf = (n: number) => `record-${String(n).padStart(4, '0')}`

export const sealed = (account: CloudAccount, id: string, text: string): PushRecord['blob'] =>
  sealRecord(account.sealKey, id, text)

/** Новые записи с id от first: baseRev 0, текст - номер. */
export const fresh = (account: CloudAccount, first: number, count: number): PushRecord[] =>
  Array.from({ length: count }, (_, index) => {
    const id = idOf(first + index)

    return { id, baseRev: 0, blob: sealed(account, id, `card ${first + index}`) }
  })

export type Reply<T> = { status: number; json: T & { error?: string }; headers: Headers }

export type CallOptions = {
  signal?: AbortSignal
  /** Свои заголовки (X-Forwarded-For). */
  headers?: Record<string, string>
  /** Подписать для другого хоста, чем адрес облака. */
  host?: string
}

/** Ответ сырого запроса node:http. */
export type RawReply = { status: number; json: unknown; headers: IncomingHttpHeaders }

/**
 * Облако на тест: start поднимает, после теста гасится само. call - запрос fetch с подписью
 * аккаунта (null - без подписи), raw - запрос node:http, у которого заголовки уходят сразу, а
 * тело - когда скажет тест (или никогда): fetch так не умеет.
 */
export const useCloud = () => {
  const state = { cloud: undefined as Cloud | undefined, dataDir: '', base: '', host: '' }

  afterEach(async () => {
    await state.cloud?.close()
    state.cloud = undefined
    if (state.dataDir) rmSync(state.dataDir, { recursive: true, force: true })
  })

  const start = async (patch: Partial<Config> = {}) => {
    state.dataDir = mkdtempSync(join(tmpdir(), 'aw-cloud-'))
    state.cloud = createCloud({ ...TEST_CONFIG, dataDir: state.dataDir, ...patch }, () => undefined)
    state.base = `http://127.0.0.1:${await state.cloud.listen(0)}`
    state.host = new URL(state.base).host
  }

  const sign = (account: CloudAccount, method: string, path: string, body: string, host = '') =>
    signedHeaders(account, { method, host: host || state.host, path, body })

  const call = async <T = Record<string, unknown>>(
    account: CloudAccount | null,
    method: string,
    path: string,
    body?: unknown,
    options: CallOptions = {},
  ): Promise<Reply<T>> => {
    const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
    const response = await fetch(`${state.base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...options.headers,
        ...(account ? sign(account, method, path, text, options.host) : {}),
      },
      ...(method === 'GET' ? {} : { body: text }),
      ...(options.signal ? { signal: options.signal } : {}),
    })

    return {
      status: response.status,
      json: (await response.json()) as T & { error?: string },
      headers: response.headers,
    }
  }

  const raw = (method: string, path: string, headers: Record<string, string>) => {
    const request = httpRequest(`${state.base}${path}`, { method, headers })
    const reply = new Promise<RawReply>((resolve, reject) => {
      request.on('response', (response) => {
        const chunks: Buffer[] = []

        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json: unknown

          // Свой ответ сервера Node (408 по сроку) - не JSON: тогда тело - строкой.
          try {
            json = JSON.parse(text) as unknown
          } catch {
            json = text
          }

          resolve({ status: response.statusCode ?? 0, json, headers: response.headers })
        })
      })
      request.on('error', reject)
    })

    request.flushHeaders()

    return { request, reply }
  }

  /** Сколько аккаунтов лежит в базе - прямо из файла, мимо сервера. */
  const accountCount = (): number => {
    const db = new DatabaseSync(join(state.dataDir, DATABASE_FILE))

    try {
      return Number(db.prepare('SELECT COUNT(*) AS n FROM accounts').get()?.['n'] ?? -1)
    } finally {
      db.close()
    }
  }

  return {
    start,
    call,
    raw,
    sign,
    accountCount,
    push: (account: CloudAccount, records: PushRecord[], options?: CallOptions) =>
      call<PushResponse>(account, 'POST', '/v1/push', { records }, options),
    pull: (account: CloudAccount, query: string, options?: CallOptions) =>
      call<PullResponse>(account, 'GET', `/v1/pull${query}`, undefined, options),
    get base() {
      return state.base
    },
    get host() {
      return state.host
    },
  }
}

import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach } from 'vitest'

import type {
  PushRecord,
  PullResponse,
  PushResponse,
} from '@agentic-workstation/cloud-protocol/api'
import {
  PULL_PAGE,
  MAX_PUSH_BYTES,
  MAX_PUSH_RECORDS,
  MAX_ACCOUNT_RECORDS,
} from '@agentic-workstation/cloud-protocol/api'
import type { CloudAccount } from '@agentic-workstation/cloud-protocol/node-account'
import { accountOf } from '@agentic-workstation/cloud-protocol/node-account'
import { openRecord, sealRecord } from '@agentic-workstation/cloud-protocol/node-seal'
import { signedHeaders } from '@agentic-workstation/cloud-protocol/node-signer'
import { CLOUD_HEADERS } from '@agentic-workstation/cloud-protocol/signing'

import type { Config } from './config.ts'
import type { Cloud } from './server.ts'
import { createCloud } from './server.ts'

const BASE_CONFIG: Omit<Config, 'dataDir'> = {
  port: 0,
  build: 'test',
  trustProxy: false,
  readsPerMinute: 100_000,
  writesPerMinute: 100_000,
  accountRequestsPerMinute: 100_000,
  maxBodyBytes: MAX_PUSH_BYTES,
  maxAccountRecords: MAX_ACCOUNT_RECORDS,
  maxWaitsPerAccount: 8,
  maxWaits: 1000,
}

/** Два компьютера с одним ключом аккаунта и чужой аккаунт. */
const laptop = accountOf(Buffer.alloc(32, 1))
const desktop = accountOf(Buffer.alloc(32, 1))
const stranger = accountOf(Buffer.alloc(32, 2))

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const idOf = (n: number) => `record-${String(n).padStart(4, '0')}`

const sealed = (account: CloudAccount, id: string, text: string): PushRecord['blob'] =>
  sealRecord(account.sealKey, id, text)

let cloud: Cloud | undefined
let dataDir = ''
let base = ''

const start = async (patch: Partial<Config> = {}) => {
  dataDir = mkdtempSync(join(tmpdir(), 'aw-cloud-'))
  cloud = createCloud({ ...BASE_CONFIG, dataDir, ...patch }, () => undefined)
  base = `http://127.0.0.1:${await cloud.listen(0)}`
}

afterEach(async () => {
  await cloud?.close()
  cloud = undefined
  rmSync(dataDir, { recursive: true, force: true })
})

type Reply<T> = { status: number; json: T & { error?: string } }

const call = async <T = Record<string, unknown>>(
  account: CloudAccount | null,
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Reply<T>> => {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(account ? signedHeaders(account, { method, path, body: text }) : {}),
    },
    ...(method === 'GET' ? {} : { body: text }),
    ...(signal ? { signal } : {}),
  })

  return { status: response.status, json: (await response.json()) as T & { error?: string } }
}

const push = (account: CloudAccount, records: PushRecord[]) =>
  call<PushResponse>(account, 'POST', '/v1/push', { records })

const pull = (account: CloudAccount, query: string, signal?: AbortSignal) =>
  call<PullResponse>(account, 'GET', `/v1/pull${query}`, undefined, signal)

/** Новые записи с id от first: baseRev 0, текст - номер. */
const fresh = (account: CloudAccount, first: number, count: number): PushRecord[] =>
  Array.from({ length: count }, (_, index) => {
    const id = idOf(first + index)

    return { id, baseRev: 0, blob: sealed(account, id, `card ${first + index}`) }
  })

describe('облако: служебные адреса и подпись', () => {
  it('отвечает на /healthz и /v1/info без подписи', async () => {
    await start()

    expect((await call(null, 'GET', '/healthz')).json).toEqual({ ok: true })
    expect((await call(null, 'GET', '/v1/info')).json).toMatchObject({
      service: 'agentic-workstation-cloud',
      protocol: 1,
      build: 'test',
    })
    expect((await call(laptop, 'GET', '/v1/nothing')).status).toBe(404)
  })

  it('без подписи, с чужим телом, с чужим запросом и повтор - 401, записи нет', async () => {
    await start()

    const unsigned = await call(null, 'POST', '/v1/push', { records: fresh(laptop, 1, 1) })

    expect(unsigned).toMatchObject({ status: 401, json: { error: 'unsigned' } })

    const text = JSON.stringify({ records: fresh(laptop, 1, 1) })
    const headers = {
      'content-type': 'application/json',
      ...signedHeaders(laptop, { method: 'POST', path: '/v1/push', body: text }),
    }
    const tampered = JSON.stringify({ records: fresh(laptop, 2, 1) })
    const send = (body: string) =>
      fetch(`${base}/v1/push`, { method: 'POST', headers, body }).then(async (response) => ({
        status: response.status,
        json: (await response.json()) as Record<string, unknown>,
      }))

    expect(await send(tampered)).toMatchObject({ status: 401, json: { error: 'bad-signature' } })
    expect((await send(text)).status).toBe(200)
    expect(await send(text)).toMatchObject({ status: 401, json: { error: 'bad-signature' } })

    // Подпись покрывает и запрос после «?»: since=0 подписан, since=5 отправлен.
    const signedFor = signedHeaders(laptop, { method: 'GET', path: '/v1/pull?since=0', body: '' })
    const swapped = await fetch(`${base}/v1/pull?since=5`, { headers: signedFor })

    expect(swapped.status).toBe(401)

    const forged = { ...signedFor, [CLOUD_HEADERS.key]: stranger.publicKey }

    expect((await fetch(`${base}/v1/pull?since=0`, { headers: forged })).status).toBe(401)
    expect((await pull(laptop, '?since=0')).json.records.map((record) => record.id)).toEqual([
      idOf(1),
    ])
  })
})

describe('облако: запись и забор', () => {
  it('новые записи получают растущие версии и читаются ключом аккаунта', async () => {
    await start()

    const pushed = await push(laptop, fresh(laptop, 1, 3))

    expect(pushed).toMatchObject({
      status: 200,
      json: {
        rev: 3,
        results: [
          { id: idOf(1), ok: true, rev: 1 },
          { id: idOf(2), ok: true, rev: 2 },
          { id: idOf(3), ok: true, rev: 3 },
        ],
      },
    })

    const page = (await pull(desktop, '?since=0')).json

    expect(page.rev).toBe(3)
    expect(page.more).toBe(false)
    expect(page.records.map((record) => [record.id, record.rev])).toEqual([
      [idOf(1), 1],
      [idOf(2), 2],
      [idOf(3), 3],
    ])
    expect(openRecord(desktop.sealKey, idOf(2), page.records[1]?.blob ?? '')).toBe('card 2')
  })

  it('устаревшая baseRev - отказ с текущей версией и без записи; верная - правка', async () => {
    await start()
    await push(laptop, fresh(laptop, 1, 2))

    const edited = await push(laptop, [
      { id: idOf(1), baseRev: 1, blob: sealed(laptop, idOf(1), 'edited on laptop') },
    ])

    expect(edited.json).toEqual({ rev: 3, results: [{ id: idOf(1), ok: true, rev: 3 }] })

    const stale = await push(desktop, [
      { id: idOf(1), baseRev: 1, blob: sealed(desktop, idOf(1), 'stale desktop edit') },
      { id: idOf(2), baseRev: 2, blob: sealed(desktop, idOf(2), 'fresh desktop edit') },
      { id: idOf(9), baseRev: 4, blob: sealed(desktop, idOf(9), 'never existed') },
    ])

    expect(stale.json).toEqual({
      rev: 4,
      results: [
        { id: idOf(1), ok: false, current: 3 },
        { id: idOf(2), ok: true, rev: 4 },
        { id: idOf(9), ok: false, current: 0 },
      ],
    })

    const page = (await pull(laptop, '?since=0')).json
    const text = (id: string) =>
      openRecord(laptop.sealKey, id, page.records.find((record) => record.id === id)?.blob ?? '')

    expect(page.records.map((record) => record.id)).toEqual([idOf(1), idOf(2)])
    expect(text(idOf(1))).toBe('edited on laptop')
    expect(text(idOf(2))).toBe('fresh desktop edit')
  })

  it('один id дважды в пачке: вторая сверяется с версией, которую дала первая', async () => {
    await start()

    const pushed = await push(laptop, [
      { id: idOf(1), baseRev: 0, blob: sealed(laptop, idOf(1), 'first') },
      { id: idOf(1), baseRev: 0, blob: sealed(laptop, idOf(1), 'conflict') },
      { id: idOf(1), baseRev: 1, blob: sealed(laptop, idOf(1), 'second') },
    ])

    expect(pushed.json).toEqual({
      rev: 2,
      results: [
        { id: idOf(1), ok: true, rev: 1 },
        { id: idOf(1), ok: false, current: 1 },
        { id: idOf(1), ok: true, rev: 2 },
      ],
    })

    const [record] = (await pull(laptop, '?since=0')).json.records

    expect(record?.rev).toBe(2)
    expect(openRecord(laptop.sealKey, idOf(1), record?.blob ?? '')).toBe('second')
  })

  it('забор по страницам: по порядку версий, more - есть ещё; с последней версии - пусто', async () => {
    await start()

    const total = PULL_PAGE + 1

    for (let first = 1; first <= total; first += MAX_PUSH_RECORDS) {
      const count = Math.min(MAX_PUSH_RECORDS, total - first + 1)

      expect((await push(laptop, fresh(laptop, first, count))).status).toBe(200)
    }

    const first = (await pull(laptop, '?since=0')).json

    expect(first).toMatchObject({ rev: total, more: true })
    expect(first.records).toHaveLength(PULL_PAGE)
    expect(first.records.map((record) => record.rev)).toEqual(
      Array.from({ length: PULL_PAGE }, (_, index) => index + 1),
    )

    const last = first.records.at(-1)?.rev ?? 0
    const second = (await pull(laptop, `?since=${last}`)).json

    expect(second).toMatchObject({ rev: total, more: false })
    expect(second.records.map((record) => record.id)).toEqual([idOf(total)])
    expect((await pull(laptop, `?since=${total}`)).json).toEqual({
      rev: total,
      records: [],
      more: false,
    })
  })

  it('чужой аккаунт не видит записей и не мешает тем же id', async () => {
    await start()
    await push(laptop, fresh(laptop, 1, 2))

    expect((await pull(stranger, '?since=0')).json).toEqual({ rev: 0, records: [], more: false })
    expect((await push(stranger, fresh(stranger, 1, 1))).json).toEqual({
      rev: 1,
      results: [{ id: idOf(1), ok: true, rev: 1 }],
    })
    expect((await pull(laptop, '?since=0')).json.rev).toBe(2)
  })
})

describe('облако: ожидание забора', () => {
  it('ждущий забор отвечает сразу, как другой компьютер записал', async () => {
    await start()
    await push(laptop, fresh(laptop, 1, 1))

    const startedAt = Date.now()
    const waiting = pull(desktop, '?since=1&wait=10')

    await sleep(150)
    await push(laptop, fresh(laptop, 2, 1))

    const page = (await waiting).json

    expect(Date.now() - startedAt).toBeLessThan(3000)
    expect(page).toMatchObject({ rev: 2, more: false })
    expect(page.records.map((record) => record.id)).toEqual([idOf(2)])
  })

  it('без перемен ждёт срок и отвечает пусто; отказ в записи не будит', async () => {
    await start()
    await push(laptop, fresh(laptop, 1, 1))

    const startedAt = Date.now()
    const waiting = pull(desktop, '?since=1&wait=1')

    await sleep(100)
    // Устаревшая правка ничего не записала - ждущему будить незачем.
    await push(laptop, [{ id: idOf(1), baseRev: 0, blob: sealed(laptop, idOf(1), 'stale') }])

    expect((await waiting).json).toEqual({ rev: 1, records: [], more: false })
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(950)

    // Чужой аккаунт ждёт так же - пустая страница с версией 0 по сроку.
    expect((await pull(stranger, '?since=0&wait=1')).json).toEqual({
      rev: 0,
      records: [],
      more: false,
    })
  })

  it('IDE впереди сервера (база из бэкапа) - ответ сразу, с версией сервера', async () => {
    await start()
    await push(laptop, fresh(laptop, 1, 2))

    const startedAt = Date.now()

    expect((await pull(laptop, '?since=7&wait=10')).json).toEqual({
      rev: 2,
      records: [],
      more: false,
    })
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })

  it('ждущих на аккаунт - не больше предела; ушедший клиент освобождает место', async () => {
    await start({ maxWaitsPerAccount: 1 })

    const leaving = new AbortController()
    const first = pull(laptop, '?since=0&wait=10', leaving.signal).catch(() => null)

    await sleep(150)

    const extraAt = Date.now()

    expect((await pull(desktop, '?since=0&wait=10')).json.records).toEqual([])
    expect(Date.now() - extraAt).toBeLessThan(1000)

    leaving.abort()
    await first
    await sleep(150)

    const waitAt = Date.now()

    expect((await pull(desktop, '?since=0&wait=1')).json.records).toEqual([])
    expect(Date.now() - waitAt).toBeGreaterThanOrEqual(950)
  })
})

describe('облако: пределы и неверные запросы', () => {
  it('тело больше предела - 413 too-large', async () => {
    await start()

    const huge = 'x'.repeat(MAX_PUSH_BYTES + 1024)
    const reply = await call(laptop, 'POST', '/v1/push', huge)

    expect(reply).toMatchObject({ status: 413, json: { error: 'too-large' } })
  })

  it('аккаунт полон - 507 account-full, пачка не записана; правки старого идут', async () => {
    await start({ maxAccountRecords: 3 })

    expect((await push(laptop, fresh(laptop, 1, 2))).json.rev).toBe(2)

    const full = await push(laptop, [
      { id: idOf(1), baseRev: 1, blob: sealed(laptop, idOf(1), 'edit') },
      ...fresh(laptop, 3, 2),
    ])

    expect(full).toMatchObject({ status: 507, json: { error: 'account-full' } })
    expect((await pull(laptop, '?since=0')).json).toMatchObject({ rev: 2 })

    expect((await push(laptop, fresh(laptop, 3, 1))).json.rev).toBe(3)
    expect(
      (await push(laptop, [{ id: idOf(1), baseRev: 1, blob: sealed(laptop, idOf(1), 'edit') }]))
        .json,
    ).toEqual({ rev: 4, results: [{ id: idOf(1), ok: true, rev: 4 }] })
    expect((await push(laptop, fresh(laptop, 4, 1))).status).toBe(507)
  })

  it('неверные since и wait - 400', async () => {
    await start()

    for (const query of [
      '?since=-1',
      '?since=abc',
      '?since=1.5',
      '?since=',
      '?since=99999999999999999',
      '?wait=26',
      '?wait=-1',
      '?wait=x',
      '?since=0&wait=1.5',
    ]) {
      expect(await pull(laptop, query), query).toMatchObject({
        status: 400,
        json: { error: 'bad-request' },
      })
    }

    expect((await pull(laptop, '')).status).toBe(200)
    expect((await pull(laptop, '?since=0&wait=0')).status).toBe(200)
  })

  it('неверное тело записи - 400', async () => {
    await start()

    for (const body of [
      'not json',
      { records: [] },
      { records: [{ id: 'short', baseRev: 0, blob: 'AAAA' }] },
      { records: [{ id: idOf(1), baseRev: -1, blob: 'AAAA' }] },
      { records: [{ id: idOf(1), baseRev: 0, blob: 'not base64url!' }] },
    ]) {
      expect(await call(laptop, 'POST', '/v1/push', body)).toMatchObject({
        status: 400,
        json: { error: 'bad-request' },
      })
    }
  })
})

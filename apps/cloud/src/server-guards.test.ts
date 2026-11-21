import { connect } from 'node:net'

import { it, expect, describe } from 'vitest'

import { MAX_PUSH_BYTES } from '@agentic-workstation/cloud-protocol/api'
import { accountOf } from '@agentic-workstation/cloud-protocol/node-account'
import { signedHeaders } from '@agentic-workstation/cloud-protocol/node-signer'

import { idOf, fresh, sleep, laptop, sealed, useCloud } from './__fixtures__/cloud-harness.ts'

const cloud = useCloud()
const { start, call, push, pull, raw } = cloud

const MIB = 1024 * 1024

/** Тело записи ровно в size байт: JSON терпит пробелы в конце. */
const pushText = (first: number, size: number) => {
  const text = JSON.stringify({ records: fresh(laptop, first, 1) })

  return text + ' '.repeat(Math.max(0, size - text.length))
}

/** Подписанный POST /v1/push сырьём: заголовки уходят сразу, тело - когда скажет тест. */
const rawPush = (text: string, extra: Record<string, string> = {}) =>
  raw('POST', '/v1/push', {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(text)),
    ...cloud.sign(laptop, 'POST', '/v1/push', text),
    ...extra,
  })

const from = (ip: string) => ({ headers: { 'x-forwarded-for': `198.51.100.1, ${ip}` } })

describe('облако: что решается до чтения тела', () => {
  it('нет адреса - 404, не тот метод - 405 с Allow; тело не ждут', async () => {
    await start()

    const { reply } = raw('POST', '/v1/nothing', { 'content-length': String(100 * MIB) })

    expect(await reply).toMatchObject({ status: 404, json: { error: 'not-found' } })

    const wrongPush = await call(laptop, 'GET', '/v1/push')
    const wrongPull = await call(laptop, 'POST', '/v1/pull', {})

    expect(wrongPush).toMatchObject({ status: 405, json: { error: 'method-not-allowed' } })
    expect(wrongPush.headers.get('allow')).toBe('POST')
    expect(wrongPull.headers.get('allow')).toBe('GET')
  })

  it('GET с телом - 400; Content-Length: 0 у GET - можно', async () => {
    await start()

    const path = '/v1/pull?since=0'
    const signed = cloud.sign(laptop, 'GET', path, '')
    const withBody = raw('GET', path, { 'content-length': '5', ...signed })

    withBody.request.end('hello')
    expect(await withBody.reply).toMatchObject({ status: 400, json: { error: 'bad-request' } })

    const chunked = raw('GET', path, { 'transfer-encoding': 'chunked', ...signed })

    chunked.request.end('hello')
    expect((await chunked.reply).status).toBe(400)

    const empty = raw('GET', path, { 'content-length': '0', ...signed })

    empty.request.end()
    expect((await empty.reply).status).toBe(200)
  })

  it('заявленная длина сверх предела - 413 сразу, тело не отправлено', async () => {
    await start()

    for (const length of [MAX_PUSH_BYTES + 1, 100 * MIB]) {
      const { reply } = rawPush(pushText(1, 100), { 'content-length': String(length) })

      expect(await reply, String(length)).toMatchObject({
        status: 413,
        json: { error: 'too-large' },
      })
    }
  })

  it('без подписи, просроченная и повторная подпись - 401 до тела', async () => {
    await start()

    const unsigned = raw('POST', '/v1/push', { 'content-length': '1000' })

    expect(await unsigned.reply).toMatchObject({ status: 401, json: { error: 'unsigned' } })

    const text = pushText(1, 200)
    const stale = signedHeaders(
      laptop,
      { method: 'POST', host: cloud.host, path: '/v1/push', body: text },
      Date.now() - 10 * 60_000,
    )

    expect(await rawPush(text, stale).reply).toMatchObject({
      status: 401,
      json: { error: 'bad-signature' },
    })

    const headers = cloud.sign(laptop, 'POST', '/v1/push', text)
    const first = rawPush(text, headers)

    first.request.end(text)
    expect((await first.reply).status).toBe(200)
    // Повтор с тем же разовым числом - отказ ещё до тела.
    expect(await rawPush(text, headers).reply).toMatchObject({
      status: 401,
      json: { error: 'bad-signature' },
    })
  })

  it('диск на исходе - 507 server-full до тела, аккаунт не заводится; забор работает', async () => {
    await start({ minFreeDiskBytes: Number.MAX_SAFE_INTEGER })

    expect(await rawPush(pushText(1, 200)).reply).toMatchObject({
      status: 507,
      json: { error: 'server-full' },
    })
    expect((await push(laptop, fresh(laptop, 1, 1))).json.error).toBe('server-full')
    expect((await pull(laptop, '?since=0')).status).toBe(200)
    expect(cloud.accountCount()).toBe(0)
  })
})

describe('облако: сроки и память', () => {
  const quick = { headersTimeoutMs: 300, requestTimeoutMs: 600 }

  it('заголовки, присланные не целиком, обрываются по сроку', async () => {
    await start(quick)

    const socket = connect(Number(new URL(cloud.base).port), '127.0.0.1')
    let answer = ''

    socket.on('data', (chunk: Buffer) => (answer += chunk.toString('utf8')))
    socket.write('GET /v1/pull HTTP/1.1\r\nHost: 127.0.0.1\r\n')

    const closedAt = await new Promise<number>((resolve) => {
      const startedAt = Date.now()

      socket.on('close', () => resolve(Date.now() - startedAt))
    })

    expect(answer).toMatch(/^HTTP\/1\.1 408/)
    expect(closedAt).toBeLessThan(2000)
  })

  it('тело, присланное не целиком, обрывается по сроку и отдаёт своё место в памяти', async () => {
    const text = pushText(1, 1500)

    await start({ ...quick, maxBodyMemoryBytes: 2000 })

    const slow = rawPush(text)

    slow.request.write(text.slice(0, 10))

    const cut = await slow.reply.catch(() => ({ status: 0 }))

    expect([0, 408]).toContain(cut.status)
    // Место отдано: такое же тело целиком проходит.
    expect((await call(laptop, 'POST', '/v1/push', pushText(2, 1500))).status).toBe(200)
  })

  it('долгий забор не обрывается сроком запроса: GET получен целиком сразу', async () => {
    await start(quick)

    const startedAt = Date.now()
    const waited = await pull(laptop, '?since=0&wait=2')

    expect(waited).toMatchObject({ status: 200, json: { rev: 0, records: [] } })
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1950)
  })

  it('тела в памяти разом - не больше потолка: лишний запрос - 503 до чтения', async () => {
    await start({ maxBodyMemoryBytes: 1500 })

    const holding = pushText(1, 1000)
    const slow = rawPush(holding)

    slow.request.write(holding.slice(0, 100))
    await sleep(100)

    expect(await call(laptop, 'POST', '/v1/push', pushText(2, 1000))).toMatchObject({
      status: 503,
      json: { error: 'server' },
    })
    // Маленькое тело в остаток места влезает.
    expect((await call(laptop, 'POST', '/v1/push', pushText(3, 400))).status).toBe(200)

    slow.request.end(holding.slice(100))
    expect((await slow.reply).status).toBe(200)
    expect((await call(laptop, 'POST', '/v1/push', pushText(2, 1000))).status).toBe(200)
  })

  it('тело без длины сверх предела - 413', async () => {
    await start({ maxBodyBytes: 1000 })

    const text = pushText(1, 3000)
    const { request, reply } = raw('POST', '/v1/push', {
      'content-type': 'application/json',
      'transfer-encoding': 'chunked',
      ...cloud.sign(laptop, 'POST', '/v1/push', text),
    })

    request.end(text)
    expect(await reply).toMatchObject({ status: 413, json: { error: 'too-large' } })
  })
})

describe('облако: пределы на адрес и на аккаунт', () => {
  const newcomers = [10, 11, 12].map((seed) => accountOf(Buffer.alloc(32, seed)))
  const [first, second, third] = newcomers as [
    (typeof newcomers)[0],
    (typeof newcomers)[0],
    (typeof newcomers)[0],
  ]

  it('новых аккаунтов с адреса - не больше предела; адрес - последняя запись прокси', async () => {
    await start({ trustProxy: true, newAccountsPerDay: 2 })

    const at = from('203.0.113.5')

    expect((await push(first, fresh(first, 1, 1), at)).status).toBe(200)
    expect((await push(second, fresh(second, 1, 1), at)).status).toBe(200)
    expect(await push(third, fresh(third, 1, 1), at)).toMatchObject({
      status: 429,
      json: { error: 'rate-limited' },
    })
    expect(cloud.accountCount()).toBe(2)

    // Подставить чужой адрес слева нельзя: верится запись, дописанная прокси.
    const spoofed = { headers: { 'x-forwarded-for': '203.0.113.6, 203.0.113.5' } }

    expect((await push(third, fresh(third, 1, 1), spoofed)).status).toBe(429)
    // Свои аккаунты пишут дальше, забор нового аккаунта ничего не заводит.
    expect((await push(first, fresh(first, 2, 1), at)).status).toBe(200)
    expect((await pull(third, '?since=0', at)).status).toBe(200)
    // С другого адреса - можно.
    expect((await push(third, fresh(third, 1, 1), from('203.0.113.6'))).status).toBe(200)
    expect(cloud.accountCount()).toBe(3)
  })

  it('ждущих с одного адреса - не больше предела, с другого - ждут', async () => {
    await start({ trustProxy: true, maxWaitsPerCaller: 1 })

    const leaving = new AbortController()
    const held = pull(first, '?since=0&wait=10', {
      ...from('203.0.113.5'),
      signal: leaving.signal,
    }).catch(() => null)

    await sleep(150)

    const extraAt = Date.now()

    expect((await pull(second, '?since=0&wait=10', from('203.0.113.5'))).status).toBe(200)
    expect(Date.now() - extraAt).toBeLessThan(1000)

    const otherAt = Date.now()

    expect((await pull(second, '?since=0&wait=1', from('203.0.113.6'))).status).toBe(200)
    expect(Date.now() - otherAt).toBeGreaterThanOrEqual(950)

    leaving.abort()
    await held
  })

  it('место аккаунта по знакам шифра: сверх - 507 и пачка целиком не записана', async () => {
    const card = (n: number, text = 'x'.repeat(300)) => ({
      id: idOf(n),
      baseRev: 0,
      blob: sealed(laptop, idOf(n), text),
    })
    const size = card(1).blob.length

    await start({ maxAccountBytes: size * 3 })
    await push(laptop, [card(1), card(2)])

    const over = await push(laptop, [{ ...card(1), baseRev: 1 }, card(3), card(4)])

    expect(over).toMatchObject({ status: 507, json: { error: 'account-full' } })
    expect((await pull(laptop, '?since=0')).json).toMatchObject({ rev: 2 })
    expect((await push(laptop, [card(3)])).status).toBe(200)
    expect((await push(laptop, [card(4)])).status).toBe(507)
    // Правка, которая укорачивает шифр, проходит и у полного аккаунта.
    expect((await push(laptop, [{ ...card(1, 'short'), baseRev: 1 }])).status).toBe(200)
  })
})

describe('облако: перегрузка таблиц в памяти', () => {
  it('книга разовых чисел полна - 503 server', async () => {
    await start({ maxNonces: 2 })

    expect((await pull(laptop, '?since=0')).status).toBe(200)
    expect((await pull(laptop, '?since=0')).status).toBe(200)
    expect(await pull(laptop, '?since=0')).toMatchObject({ status: 503, json: { error: 'server' } })
  })

  it('таблица пределов полна - новый адрес получает 503, знакомый - нет', async () => {
    await start({ trustProxy: true, maxTrackedKeys: 1 })

    expect((await pull(laptop, '?since=0', from('203.0.113.5'))).status).toBe(200)
    expect(await pull(laptop, '?since=0', from('203.0.113.6'))).toMatchObject({
      status: 503,
      json: { error: 'server' },
    })
    expect((await pull(laptop, '?since=0', from('203.0.113.5'))).status).toBe(200)
  })
})

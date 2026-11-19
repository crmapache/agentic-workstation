import type { Server } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { ModelProxy } from './model-proxy'

/** Подставной сервер моделей: какой ключ пришёл и на какой путь; ответ - потоком в два куска. */
let upstream: Server
let base = ''
let seen: { authorization: string; path: string; body: string }[] = []

beforeEach(async () => {
  seen = []
  upstream = createServer((request, response) => {
    let body = ''

    request.on('data', (chunk: Buffer) => (body += chunk.toString()))
    request.on('end', () => {
      seen.push({
        authorization: request.headers.authorization ?? '',
        path: request.url ?? '',
        body,
      })
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write('data: one\n\n')
      setTimeout(() => response.end('data: two\n\n'), 20)
    })
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/api/v1`
})

afterEach(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()))
})

describe('прокси облачных подключений', () => {
  it('ключ процесса меняется на настоящий, ответ идёт потоком, отозванный ключ не пускает', async () => {
    const proxy = new ModelProxy((id) => (id === 'or1' ? { baseUrl: base, key: 'sk-real' } : null))
    const lease = proxy.lease(['or1'])
    const url = `${await proxy.baseUrlOf('or1')}/chat/completions?x=1`
    const post = (token: string) =>
      fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{"model":"a/b"}',
      })

    const ok = await post(lease.token)

    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('data: one\n\ndata: two\n\n')
    expect(seen).toEqual([
      {
        authorization: 'Bearer sk-real',
        path: '/api/v1/chat/completions?x=1',
        body: '{"model":"a/b"}',
      },
    ])

    expect((await post('stolen')).status).toBe(401)

    const other = await fetch(`${await proxy.baseUrlOf('or2')}/models`, {
      headers: { authorization: `Bearer ${lease.token}` },
    })

    expect(other.status).toBe(401)

    lease.release()
    expect((await post(lease.token)).status).toBe(401)
    expect(seen).toHaveLength(1)
    await proxy.stop()
  })
})

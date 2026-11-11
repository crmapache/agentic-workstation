import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { probeAuth } from './import-probe'

/** Сервер, который на всё отвечает одним кодом и телом - как сервер на OAuth без входа. */
const answering = (status: number, body: string) =>
  createServer((request, response) => {
    request.resume()
    response.writeHead(status, { 'Content-Type': 'application/json' }).end(body)
  })

describe('probeAuth', () => {
  let server: Server
  let url = ''

  const listen = async (next: Server) => {
    server = next
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`
  }

  beforeEach(() => {
    url = ''
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it('401 с телом без «401» - сервер на OAuth, и по HTTP, и по SSE', async () => {
    await listen(answering(401, '{"error":"invalid_token","error_description":"Missing"}'))

    expect(await probeAuth(url, 'http')).toBe('oauth')
    expect(await probeAuth(url, 'sse')).toBe('oauth')
  })

  it('500 - не ответил, а не OAuth', async () => {
    await listen(answering(500, '{"error":"boom"}'))

    expect(await probeAuth(url, 'http')).toBe('unreachable')
  })
})

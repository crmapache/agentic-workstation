import { rm, chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { OpenCodeEvent } from './opencode-server'
import { dataOf, OpenCodeServer, OpenCodeReplyError } from './opencode-server'

/**
 * Поддельный `opencode serve --stdio`: свободный порт, адрес строкой JSON, Basic с паролем из
 * окружения, поток событий (server.connected и одно своё), `POST /api/session` и
 * `GET /api/env` (что сервер получил в окружении). Гаснет, когда закрывается stdin.
 */
const FAKE_SERVER = `#!/usr/bin/env node
const http = require('node:http')
const expected = 'Basic ' + Buffer.from('opencode:' + process.env.OPENCODE_SERVER_PASSWORD).toString('base64')
const server = http.createServer((req, res) => {
  if (req.headers.authorization !== expected) {
    res.writeHead(401, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ _tag: 'UnauthorizedError', message: 'Authentication required' }))
  }
  if (req.url === '/api/event') {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: {"type":"server.connected","data":{}}\\n\\n')
    setTimeout(() => res.write('data: {"type":"session.renamed","location":{"directory":"/p"},"data":{"title":"Hi"}}\\n\\n'), 50)
    return
  }
  if (req.url === '/api/env') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ data: { xdg: process.env.XDG_DATA_HOME, config: process.env.OPENCODE_CONFIG_CONTENT } }))
  }
  if (req.url === '/api/session' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    return req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: { id: 'ses_1', got: JSON.parse(body) } }))
    })
  }
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ _tag: 'NotFound', message: 'no route' }))
})
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ url: 'http://127.0.0.1:' + server.address().port }) + '\\n')
})
process.stdin.resume()
process.stdin.on('end', () => process.exit(0))
`

let dir = ''
let binary = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'opencode-server-'))
  binary = join(dir, 'opencode')
  await writeFile(binary, FAKE_SERVER)
  await chmod(binary, 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const startServer = (events: OpenCodeEvent[], exits: (number | null)[]) =>
  new OpenCodeServer(
    {
      binary,
      cwd: dir,
      env: process.env as Record<string, string>,
      dirs: {
        config: join(dir, 'c'),
        data: join(dir, 'd'),
        state: join(dir, 's'),
        cache: join(dir, 'k'),
      },
      config: '{"share":"disabled"}',
    },
    { onEvent: (event) => events.push(event), onExit: (code) => exits.push(code) },
  )

describe('процесс opencode serve --stdio', () => {
  it('адрес, пароль, свои папки и конфиг; запросы, события, остановка закрытием stdin', async () => {
    const events: OpenCodeEvent[] = []
    const exits: (number | null)[] = []
    const server = startServer(events, exits)

    expect(dataOf(await server.request('POST', '/api/session', { body: { title: 'x' } }))).toEqual({
      id: 'ses_1',
      got: { title: 'x' },
    })
    expect(dataOf(await server.request('GET', '/api/env'))).toEqual({
      xdg: join(dir, 'd'),
      config: '{"share":"disabled"}',
    })
    await expect.poll(() => events.map((event) => event.type)).toContain('session.renamed')
    expect(events.find((event) => event.type === 'session.renamed')).toEqual({
      type: 'session.renamed',
      data: { title: 'Hi' },
      directory: '/p',
    })

    const missing = await server.request('GET', '/api/nope').catch((error: unknown) => error)

    expect(missing).toBeInstanceOf(OpenCodeReplyError)
    expect(missing).toMatchObject({ status: 404, tag: 'NotFound', message: 'no route' })

    await server.stop()
    expect(exits).toEqual([0])
    expect(server.isAlive).toBe(false)
  })
})

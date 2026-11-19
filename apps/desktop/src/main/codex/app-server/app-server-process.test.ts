import { rm, chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { AppServerProcess, AppServerReplyError } from './app-server-process'

/**
 * Поддельный `codex app-server`: отвечает на рукопожатие, эхо и отказ, по «ask» задаёт свой
 * вопрос и докладывает ответ уведомлением; закрытый stdin - выход.
 */
const FAKE_SERVER = `#!/usr/bin/env node
const readline = require('node:readline')
const out = (value) => process.stdout.write(JSON.stringify(value) + '\\n')
let initialized = false
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') return out({ id: message.id, result: { userAgent: 'fake' } })
  if (message.method === 'initialized') { initialized = true; return }
  if (message.method === 'echo') return out({ id: message.id, result: { echo: message.params, initialized } })
  if (message.method === 'fail') return out({ id: message.id, error: { code: -32000, message: 'boom' } })
  if (message.method === 'ask') {
    out({ id: message.id, result: {} })
    return out({ id: 's1', method: 'item/tool/requestUserInput', params: { questions: [] } })
  }
  if (message.id === 's1') return out({ method: 'answered', params: message.result })
}).on('close', () => process.exit(0))
process.stdout.write('not json line\\n')
`

let dir = ''
let binary = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codex-app-server-'))
  binary = join(dir, 'codex')
  await writeFile(binary, FAKE_SERVER)
  await chmod(binary, 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const start = (events: Partial<ConstructorParameters<typeof AppServerProcess>[1]> = {}) =>
  new AppServerProcess(
    {
      binary,
      args: [],
      cwd: dir,
      env: process.env as Record<string, string>,
      client: { name: 'test', title: 'Test', version: '0' },
    },
    {
      onNotification: () => undefined,
      onServerRequest: () => undefined,
      onExit: () => undefined,
      ...events,
    },
  )

describe('процесс app-server', () => {
  it('запрос ждёт рукопожатия и получает свой ответ; ошибка сервера - отказ с кодом', async () => {
    const server = start()

    expect(await server.request('echo', { text: 'hi' })).toEqual({
      echo: { text: 'hi' },
      initialized: true,
    })
    await expect(server.request('fail')).rejects.toBeInstanceOf(AppServerReplyError)
    await server.stop()
  })

  it('вопрос сервера уходит наружу, ответ на него сервер получает', async () => {
    const notes: unknown[] = []
    const server = start({
      onServerRequest: (id, method) => {
        expect(method).toBe('item/tool/requestUserInput')
        server.respond(id, { answers: { q: { answers: ['yes'] } } })
      },
      onNotification: (method, params) => {
        if (method === 'answered') notes.push(params)
      },
    })

    await server.request('ask')
    await expect.poll(() => notes).toEqual([{ answers: { q: { answers: ['yes'] } } }])
    await server.stop()
  })

  it('остановка закрывает stdin, процесс выходит сам; запросы после выхода отказывают', async () => {
    let exitCode: number | null = -1
    const server = start({ onExit: (code) => (exitCode = code) })

    await server.request('echo')
    await server.stop()

    expect(exitCode).toBe(0)
    expect(server.isAlive).toBe(false)
    await expect(server.request('echo')).rejects.toThrow()
  })
})

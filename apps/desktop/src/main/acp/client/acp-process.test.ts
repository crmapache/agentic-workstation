import { rm, chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { AcpProcessEvents } from './acp-process'
import { AcpProcess, errorTextOf, AcpReplyError } from './acp-process'

/**
 * Поддельный агент ACP: отвечает на рукопожатие (строки - JSON-RPC 2.0), эхо и отказ; по «ask»
 * задаёт свой вопрос и докладывает ответ уведомлением; закрытый stdin - выход.
 */
const FAKE_AGENT = `#!/usr/bin/env node
const readline = require('node:readline')
const out = (value) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\\n')
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.jsonrpc !== '2.0') return out({ id: message.id, error: { code: -32600, message: 'no jsonrpc' } })
  if (message.method === 'initialize') {
    return out({ id: message.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true }, clientSeen: message.params.clientCapabilities } })
  }
  if (message.method === 'echo') return out({ id: message.id, result: { echo: message.params } })
  if (message.method === 'fail') return out({ id: message.id, error: { code: -32000, message: 'Authentication required' } })
  if (message.method === 'ask') {
    out({ id: message.id, result: {} })
    return out({ id: 7, method: 'session/request_permission', params: { options: [] } })
  }
  if (message.method === 'fs') {
    out({ id: message.id, result: {} })
    return out({ id: 8, method: 'fs/read_text_file', params: { path: '/x' } })
  }
  if (message.id === 7 || message.id === 8) return out({ method: 'answered', params: message })
}).on('close', () => process.exit(0))
process.stdout.write('not json line\\n')
`

let dir = ''
let binary = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acp-process-'))
  binary = join(dir, 'agent')
  await writeFile(binary, FAKE_AGENT)
  await chmod(binary, 0o755)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const start = (events: Partial<AcpProcessEvents> = {}) =>
  new AcpProcess(
    {
      binary,
      args: [],
      cwd: dir,
      env: process.env as Record<string, string>,
      capabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      version: '0',
    },
    {
      onNotification: () => undefined,
      onRequest: () => Promise.reject(new AcpReplyError(-32601, 'nope')),
      onExit: () => undefined,
      ...events,
    },
  )

describe('процесс агента ACP', () => {
  it('рукопожатие объявляет возможности клиента, запросы ждут его и получают ответы', async () => {
    const agent = start()

    const init = (await agent.initialized) as unknown as Record<string, unknown>

    expect(init['clientSeen']).toEqual({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    })
    await expect(agent.request('echo', { a: 1 })).resolves.toEqual({ echo: { a: 1 } })
    await agent.stop()
  })

  it('ошибка агента - AcpReplyError с кодом', async () => {
    const agent = start()

    await expect(agent.request('fail')).rejects.toMatchObject({
      code: -32000,
      message: 'Authentication required',
    })
    await agent.stop()
  })

  it('запрос агента идёт обработчику, его ответ уходит агенту с тем же id', async () => {
    const answered = new Promise<unknown>((resolve) => {
      const agent = start({
        onRequest: (method) =>
          Promise.resolve({ outcome: { outcome: 'selected', optionId: `${method}:ok` } }),
        onNotification: (method, params) => {
          if (method === 'answered') {
            resolve(params)
            void agent.stop()
          }
        },
      })

      void agent.request('ask')
    })

    await expect(answered).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 7,
      result: { outcome: { optionId: 'session/request_permission:ok' } },
    })
  })

  it('незнакомый запрос агента - отказ -32601', async () => {
    const answered = new Promise<unknown>((resolve) => {
      const agent = start({
        onNotification: (method, params) => {
          if (method === 'answered') {
            resolve(params)
            void agent.stop()
          }
        },
      })

      void agent.request('fs')
    })

    await expect(answered).resolves.toMatchObject({ id: 8, error: { code: -32601 } })
  })

  it('выход процесса - событие с кодом, ждущие запросы отказывают', async () => {
    let exitCode: number | null | undefined
    const agent = start({
      onExit: (code) => {
        exitCode = code
      },
    })

    await agent.initialized
    await agent.stop()

    expect(exitCode).toBe(0)
    await expect(agent.request('echo')).rejects.toThrow()
  })
})

describe('текст сбоя агента', () => {
  it('подробности из `data` - к сообщению, если их там нет', () => {
    expect(
      errorTextOf(new AcpReplyError(-32603, 'Internal error', { details: '403 TOS_VIOLATION' })),
    ).toBe('Internal error: 403 TOS_VIOLATION')
    expect(errorTextOf(new AcpReplyError(-32603, 'Quota: 429', '429'))).toBe('Quota: 429')
    expect(errorTextOf(new AcpReplyError(-32603, 'Internal error'))).toBe('Internal error')
    expect(errorTextOf('plain')).toBe('plain')
  })
})

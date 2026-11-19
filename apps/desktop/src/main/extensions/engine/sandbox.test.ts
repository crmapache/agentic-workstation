import { rm, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { ExtensionProblem } from '@shared/extensions'

import { ExtensionSandbox } from './sandbox'
import type { SandboxHost } from './sandbox'
import { SANDBOX_LIMITS } from './sandbox.constants'
import { SandboxBroken } from './sandbox.utils'

type Call = { method: string; args: unknown }

/** Хост для проверок: вызовы IDE пишутся, ответ - из answers по имени метода. */
const recordingHost = (answers: Record<string, (args: unknown) => unknown> = {}) => {
  const calls: Call[] = []
  const logs: string[] = []
  const broke: ExtensionProblem[] = []
  const host: SandboxHost = {
    call: async (method, payload) => {
      const args = JSON.parse(payload) as unknown

      calls.push({ method, args })

      const answer = answers[method]

      if (!answer) return JSON.stringify({ ok: true, value: null })

      try {
        return JSON.stringify({ ok: true, value: (await answer(args)) ?? null })
      } catch (error) {
        return JSON.stringify({ ok: false, error: (error as Error).message })
      }
    },
    log: (level, text) => logs.push(`${level}: ${text}`),
    broke: (problem) => broke.push(problem),
  }

  return { host, calls, logs, broke }
}

const INFO = { id: 'demo', name: 'Demo', version: '1.0.0' }

describe('ExtensionSandbox', () => {
  let dir = ''
  const live: ExtensionSandbox[] = []

  const open = async (main: string, host: SandboxHost, limits = SANDBOX_LIMITS) => {
    await writeFile(join(dir, 'main.js'), main)

    const sandbox = await ExtensionSandbox.create(
      { id: 'demo', dir, main: 'main.js', info: INFO },
      host,
      limits,
    )

    live.push(sandbox)

    return sandbox
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ext-sandbox-'))
  })

  afterEach(async () => {
    await Promise.all(live.splice(0).map((sandbox) => sandbox.stop()))
    await rm(dir, { recursive: true, force: true })
  })

  it('исполняет модуль: activate получает ide, команда регистрируется, колбэк зовётся по номеру', async () => {
    const { host, calls } = recordingHost()
    const sandbox = await open(
      `export async function activate(ide) {
        await ide.commands.register('hello', 'Say hello', (name) => 'Hello, ' + name + ' from ' + ide.extension.name)
      }`,
      host,
    )

    await sandbox.start()

    const register = calls.find((call) => call.method === 'commands.register')

    expect(register?.args).toMatchObject({ id: 'hello', title: 'Say hello' })

    const handler = (register?.args as { handler: number }).handler

    await expect(sandbox.dispatch(handler, ['Max'])).resolves.toBe('Hello, Max from Demo')
  })

  it('ждёт ответа IDE асинхронно и отдаёт ошибку IDE исключением внутри', async () => {
    const { host, calls } = recordingHost({
      'storage.get': () => 41,
      'files.read': () => {
        throw new Error('This extension may not read files.')
      },
    })
    const sandbox = await open(
      `export async function activate(ide) {
        const value = await ide.storage.get('count')
        await ide.storage.set('count', value + 1)
        try { await ide.files.read('a.txt') } catch (error) { await ide.storage.set('error', error.message) }
      }`,
      host,
    )

    await sandbox.start()

    expect(calls.map((call) => call.method)).toEqual([
      'storage.get',
      'storage.set',
      'files.read',
      'storage.set',
    ])
    expect(calls[1]?.args).toEqual({ key: 'count', value: 42 })
    expect(calls[3]?.args).toEqual({ key: 'error', value: 'This extension may not read files.' })
  })

  it('не даёт ни Node, ни сети, ни конструктора функций наружу', async () => {
    const { host, calls } = recordingHost()
    const sandbox = await open(
      `const probe = [typeof process, typeof require, typeof fetch, typeof XMLHttpRequest,
        (() => {}).constructor('return typeof process')(),
        typeof globalThis.__aw_host, Object.isFrozen(ide), Object.isFrozen(ide.files)]
      export async function activate(ide) { await ide.storage.set('probe', probe) }`,
      host,
    )

    await sandbox.start()

    expect(calls[0]?.args).toEqual({
      key: 'probe',
      value: [
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        true,
        true,
      ],
    })
  })

  it('пишет console.* в журнал', async () => {
    const { host, logs } = recordingHost()
    const sandbox = await open(
      `console.log('ready', { a: 1 }); console.error(new Error('boom'))`,
      host,
    )

    await sandbox.start()

    expect(logs[0]).toBe('log: ready {"a":1}')
    expect(logs[1]).toMatch(/^error: boom/)
  })

  it('обрывает вечный цикл по сроку и ломает песочницу', async () => {
    const { host } = recordingHost()
    const sandbox = await open(
      `export async function activate(ide) {
        await ide.commands.register('spin', 'Spin', () => { while (true) {} })
      }`,
      host,
      { ...SANDBOX_LIMITS, sliceMs: 100 },
    )
    const started = Date.now()

    await sandbox.start()

    const error = await sandbox.dispatch(1, []).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(SandboxBroken)
    expect((error as SandboxBroken).problem.code).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(2000)
    await expect(sandbox.dispatch(1, [])).rejects.toBeInstanceOf(SandboxBroken)
  })

  it('держит память под потолком: перерасход - поломка песочницы, а не процесса', async () => {
    const { host } = recordingHost()
    const sandbox = await open(
      `const hog = []
      export async function activate(ide) {
        await ide.commands.register('hog', 'Hog', () => { while (true) hog.push('x'.repeat(100000) + hog.length) })
      }`,
      host,
      { ...SANDBOX_LIMITS, memoryBytes: 32 * 1024 * 1024 },
    )

    await sandbox.start()

    const error = await sandbox.dispatch(1, []).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(SandboxBroken)
    expect((error as SandboxBroken).problem.code).toBe('memory')
  })

  it('грузит модули только относительным путём из своей папки', async () => {
    await mkdir(join(dir, 'lib'))
    await writeFile(join(dir, 'lib', 'twice.js'), 'export const twice = (x) => x * 2')

    const outside = await mkdtemp(join(tmpdir(), 'ext-outside-'))

    await writeFile(join(outside, 'secret.js'), 'export const secret = 1')
    await symlink(join(outside, 'secret.js'), join(dir, 'link.js'))

    const { host, calls } = recordingHost()
    const good = await open(
      `import { twice } from './lib/twice.js'
      export async function activate(ide) { await ide.storage.set('v', twice(21)) }`,
      host,
    )

    await good.start()
    expect(calls[0]?.args).toEqual({ key: 'v', value: 42 })

    for (const source of [
      `import { secret } from './link.js'`,
      `import { x } from '../outside.js'`,
      `import fs from 'fs'`,
    ]) {
      const bad = await open(source, recordingHost().host)
      const error = await bad.start().catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(SandboxBroken)
      expect((error as SandboxBroken).problem.code).toBe('load')
    }

    await rm(outside, { recursive: true, force: true })
  })

  it('ошибка в самом модуле - причина load со стеком', async () => {
    const sandbox = await open(`throw new TypeError('bad start')`, recordingHost().host)
    const error = await sandbox.start().catch((caught: unknown) => caught)

    expect((error as SandboxBroken).problem).toMatchObject({ code: 'load' })
    expect((error as SandboxBroken).problem.detail).toMatch(/^TypeError: bad start/)
  })

  it('таймеры зовут колбэк и снимаются вместе с песочницей', async () => {
    const { host, calls } = recordingHost()
    const sandbox = await open(
      `let ticks = 0
      const id = setInterval(() => { ticks++; if (ticks === 3) { clearInterval(id); ide.storage.set('ticks', ticks) } }, 10)`,
      host,
    )

    await sandbox.start()
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(calls).toEqual([{ method: 'storage.set', args: { key: 'ticks', value: 3 } }])
  })

  it('deactivate зовётся при остановке', async () => {
    const { host, calls } = recordingHost()
    const sandbox = await open(
      `export async function deactivate() { await ide.storage.set('bye', true) }`,
      host,
    )

    await sandbox.start()
    await sandbox.stop()

    expect(calls).toEqual([{ method: 'storage.set', args: { key: 'bye', value: true } }])
  })
})

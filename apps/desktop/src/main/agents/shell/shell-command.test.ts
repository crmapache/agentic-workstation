import { tmpdir } from 'node:os'

import { it, expect, describe } from 'vitest'

import { ShellCommand } from './shell-command'

const env = { SHELL: '/bin/sh', PATH: process.env['PATH'] ?? '/usr/bin:/bin' }

describe('команда «!»', () => {
  it('вывод, код выхода и папка проекта', async () => {
    const outputs: string[] = []
    const shell = new ShellCommand('pwd; echo oops >&2; exit 3', tmpdir(), env, (output) =>
      outputs.push(output.stdout),
    )
    const outcome = await shell.finished

    expect(outcome.status).toBe('done')
    expect(outcome.exitCode).toBe(3)
    expect(outcome.stderr.trim()).toBe('oops')
    expect(outcome.stdout.trim().endsWith(tmpdir().split('/').at(-1) ?? '')).toBe(true)
    expect(outputs.length).toBeGreaterThan(0)
  })

  it('остановка гасит её вместе с детьми', async () => {
    const shell = new ShellCommand('sleep 30 & sleep 30', tmpdir(), env, () => undefined)

    shell.stop()

    const outcome = await shell.finished

    expect(outcome.status).toBe('stopped')
    expect(outcome.exitCode).toBeNull()
  })

  it('папки нет - не запустилась, а не повисла', async () => {
    const shell = new ShellCommand('echo hi', '/nonexistent-folder', env, () => undefined)

    await expect(shell.finished).resolves.toMatchObject({ status: 'failed' })
  })
})

import { execFile } from 'node:child_process'
import { rm, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { SWAP_SCRIPT } from './update.constants'

const run = promisify(execFile)

/** pid, которого нет: подмена не ждёт выхода IDE. */
const GONE_PID = '999999'

/**
 * Настоящий скрипт подмены в /bin/sh на временной папке. open подменён записью аргументов в
 * файл: видно, с какими флагами и переменными откроется новая версия.
 */
describe('SWAP_SCRIPT', () => {
  let dir = ''

  const swap = async (background: string, env: string[]) => {
    const target = join(dir, 'Agentic Workstation.app')
    const staging = join(dir, 'staging')

    await mkdir(target)
    await writeFile(join(target, 'version'), 'old')
    await mkdir(join(staging, 'new.app'), { recursive: true })
    await writeFile(join(staging, 'new.app', 'version'), 'new')
    await mkdir(join(dir, 'bin'))
    await writeFile(
      join(dir, 'bin', 'open'),
      `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done > "${join(dir, 'open-args')}"\n`,
      { mode: 0o755 },
    )
    await run(
      '/bin/sh',
      [
        '-c',
        SWAP_SCRIPT,
        'agentic-workstation-update',
        GONE_PID,
        target,
        join(staging, 'new.app'),
        join(staging, 'previous.app'),
        join(dir, 'update.log'),
        '10',
        background,
        ...env,
      ],
      { env: { ...process.env, PATH: `${join(dir, 'bin')}:/usr/bin:/bin` } },
    )

    return {
      version: await readFile(join(target, 'version'), 'utf8'),
      log: await readFile(join(dir, 'update.log'), 'utf8'),
      open: (await readFile(join(dir, 'open-args'), 'utf8')).trim().split('\n'),
      target,
    }
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-swap-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('обычная IDE: новая версия на месте и открывается просто open', async () => {
    const result = await swap('', [])

    expect(result.version).toBe('new')
    expect(result.log).toContain('update: installed')
    expect(result.open).toEqual([result.target])
  })

  it('копия агента: в фоне, с профилем и окном сбоку, путь профиля с пробелами цел', async () => {
    const profile = 'AGENTIC_WORKSTATION_PROFILE_DIR=/Users/me/Agent Profile'
    const aside = 'AGENTIC_WORKSTATION_WINDOW_ASIDE=1'
    const result = await swap('background', [profile, aside])

    expect(result.version).toBe('new')
    expect(result.open).toEqual(['-g', '--env', aside, '--env', profile, result.target])
  })
})

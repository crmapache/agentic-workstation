import { rm, stat, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import { ensurePrivateDir } from './browser-hub'
import type { BrowserPlaces } from './browser-places'
import { BrowserRuntime } from './browser-runtime'

describe('мост браузера: установка и уборка', () => {
  let dir = ''
  let socketDir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-runtime-'))
    // Путь сокета короткий: у macOS предел 104 байта, а tmpdir() длинный.
    socketDir = await mkdtemp('/tmp/aw-rt-')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
    await rm(socketDir, { recursive: true, force: true })
  })

  const places = (socketPath: string | null): BrowserPlaces => ({
    channel: 'dev',
    socketPath,
    hostDir: join(dir, 'native-host/dev'),
    extensionDir: join(dir, 'chrome-extension'),
    legacyExtensionDir: null,
  })

  const source = async () => {
    const extensionDir = join(dir, 'dist')

    await mkdir(extensionDir, { recursive: true })
    await writeFile(join(extensionDir, 'build.json'), JSON.stringify({ build: 'b1' }))
    await writeFile(join(extensionDir, 'manifest.json'), '{}')
    await writeFile(join(dir, 'host.js'), '')

    return { hostJs: join(dir, 'host.js'), extensionDir }
  }

  it('путь сокета не уложился - код сбоя в состоянии, без исключения', async () => {
    const changed = vi.fn()
    const runtime = new BrowserRuntime({
      places: places(null),
      source: () => null,
      execPath: '/bin/ide',
      ideVersion: '0',
      manifestDirs: () => [join(dir, 'hosts')],
      changed,
    })

    await expect(runtime.enable()).resolves.toBeUndefined()
    expect(runtime.state()).toMatchObject({ installed: false, failure: 'socket-path' })
    expect(changed).toHaveBeenCalled()
  })

  it('уборка снимает сокет, манифест, копию host и файл сокета; повтор ничего не ломает', async () => {
    const socketPath = join(socketDir, 'dev.sock')
    const hosts = join(dir, 'hosts')
    const bridge = await source()
    const runtime = new BrowserRuntime({
      places: places(socketPath),
      source: () => bridge,
      execPath: '/bin/ide',
      ideVersion: '0',
      manifestDirs: () => [hosts],
      changed: () => undefined,
    })

    await runtime.enable()
    expect(runtime.state()).toMatchObject({ installed: true, failure: null })
    expect(runtime.hub.isRunning).toBe(true)
    await stat(join(hosts, 'com.agentic_workstation.browser_dev.json'))

    await runtime.remove()
    await runtime.remove()

    expect(runtime.hub.isRunning).toBe(false)
    expect(runtime.state()).toMatchObject({ installed: false, extensionDir: null })
    await expect(stat(join(hosts, 'com.agentic_workstation.browser_dev.json'))).rejects.toThrow()
    await expect(stat(join(dir, 'native-host/dev'))).rejects.toThrow()
    await expect(stat(socketPath)).rejects.toThrow()
    // Папку расширения человек загрузил в Chrome - она остаётся.
    await stat(join(dir, 'chrome-extension/manifest.json'))
  })

  it('уборка на старте без коннектора: остатки прошлых запусков уходят, моста не было', async () => {
    const hosts = join(dir, 'hosts')
    const changed = vi.fn()

    await mkdir(hosts, { recursive: true })
    await mkdir(join(dir, 'native-host/dev'), { recursive: true })
    await writeFile(join(hosts, 'com.agentic_workstation.browser_dev.json'), '{}')
    await writeFile(join(hosts, 'com.other.host.json'), '{}')

    await new BrowserRuntime({
      places: places(join(socketDir, 'dev.sock')),
      source: () => null,
      execPath: '/bin/ide',
      ideVersion: '0',
      manifestDirs: () => [hosts],
      changed,
    }).remove()

    await expect(stat(join(hosts, 'com.agentic_workstation.browser_dev.json'))).rejects.toThrow()
    await stat(join(hosts, 'com.other.host.json'))
    await expect(stat(join(dir, 'native-host/dev'))).rejects.toThrow()
    expect(changed).not.toHaveBeenCalled()
  })
})

describe('папка сокета', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-private-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('своя - права 700, даже если была открыта шире', async () => {
    const own = join(dir, 'own')

    await mkdir(own, { mode: 0o755 })
    await ensurePrivateDir(own)
    expect((await stat(own)).mode & 0o777).toBe(0o700)
  })

  it('ссылка вместо папки - отказ: сокет не слушает в чужом месте', async () => {
    const target = join(dir, 'target')
    const link = join(dir, 'link')

    await mkdir(target)
    await symlink(target, link)
    await expect(ensurePrivateDir(link)).rejects.toThrow('not a private folder')
  })
})

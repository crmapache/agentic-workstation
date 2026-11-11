import { execFile } from 'node:child_process'
import { rm, stat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { EXTENSION_ORIGIN } from '@agentic-workstation/browser-protocol/extension-id'

import { browserPlaces } from './browser-places'
import {
  installBridge,
  wrapperScript,
  uninstallBridge,
  extensionBuildIn,
  browserManifestDirs,
} from './native-host-install'

const TMP = '/var/folders/zz/abc/T'

describe('места моста браузера', () => {
  it('установленная и dev - разные сокеты и host; профиль - свои, с хешем', () => {
    const installed = browserPlaces({
      home: '/Users/u',
      tmp: TMP,
      isPackaged: true,
      profileDir: undefined,
    })
    const dev = browserPlaces({
      home: '/Users/u',
      tmp: TMP,
      isPackaged: false,
      profileDir: undefined,
    })
    const copy = browserPlaces({
      home: '/Users/u',
      tmp: TMP,
      isPackaged: false,
      profileDir: '/tmp/p',
    })

    expect(installed).toEqual({
      channel: 'installed',
      socketPath: '/Users/u/.agentic-workstation/browser/installed.sock',
      hostDir: '/Users/u/.agentic-workstation/native-host/installed',
      extensionDir: '/Users/u/.agentic-workstation/chrome-extension',
    })
    expect(dev.socketPath).toBe('/Users/u/.agentic-workstation/browser/dev.sock')
    expect(copy.channel).toBe('dev')
    expect(copy.socketPath).toMatch(/browser\/dev-[0-9a-f]{8}\.sock$/)
    expect(copy.extensionDir).toMatch(/chrome-extension-dev-[0-9a-f]{8}$/)
  })

  it('длинный домашний путь не роняет старт: сокет - во временной папке, не влез и туда - null', () => {
    const home = `/Users/${'x'.repeat(80)}`
    const fallback = browserPlaces({ home, tmp: TMP, isPackaged: true, profileDir: undefined })
    const none = browserPlaces({
      home,
      tmp: `/var/${'y'.repeat(90)}`,
      isPackaged: true,
      profileDir: undefined,
    })

    expect(fallback.socketPath).toBe(`${TMP}/agentic-workstation-browser/installed.sock`)
    expect(fallback.hostDir).toBe(`${home}/.agentic-workstation/native-host/installed`)
    expect(none.socketPath).toBeNull()
  })
})

describe('установка моста', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-install-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const source = async (build: string) => {
    const extensionDir = join(dir, `ext-${build}`)

    await mkdir(extensionDir, { recursive: true })
    await writeFile(join(extensionDir, 'build.json'), JSON.stringify({ build }))
    await writeFile(join(extensionDir, 'manifest.json'), '{}')
    await writeFile(join(dir, 'host.js'), 'process.stdout.write("ok")')

    return { hostJs: join(dir, 'host.js'), extensionDir }
  }

  it('обёртка экранирует кавычки и пробелы в путях', async () => {
    const script = wrapperScript("/Apps/Agentic Work's.app/bin", '/h/host.js', '/s/x.sock')

    expect(script).toContain(`ELECTRON_RUN_AS_NODE=1 exec '/Apps/Agentic Work'\\''s.app/bin'`)

    const file = join(dir, 'echo.sh')

    // Та же обёртка с echo вместо бинарника: аргументы доходят целыми.
    await writeFile(file, wrapperScript('/bin/echo', "a b'c", '/s/x.sock'), { mode: 0o700 })

    const { stdout } = await promisify(execFile)(file, ['chrome-extension://x/'])

    expect(stdout.trim()).toBe("a b'c --socket /s/x.sock chrome-extension://x/")
  })

  it('ставит host, обёртку, расширение и манифесты; повтор не копирует ту же сборку', async () => {
    const places = {
      channel: 'dev' as const,
      socketPath: '/tmp/x.sock',
      hostDir: join(dir, 'home/native-host/dev'),
      extensionDir: join(dir, 'home/chrome-extension'),
    }
    const manifests = join(dir, 'Chrome/NativeMessagingHosts')

    expect(await installBridge(await source('b1'), places, '/bin/ide', [manifests])).toBe('b1')

    const manifest = JSON.parse(
      await readFile(join(manifests, 'com.agentic_workstation.browser_dev.json'), 'utf8'),
    ) as Record<string, unknown>

    expect(manifest).toEqual({
      name: 'com.agentic_workstation.browser_dev',
      description: 'Agentic Workstation browser bridge',
      path: join(places.hostDir, 'run-host.sh'),
      type: 'stdio',
      allowed_origins: [EXTENSION_ORIGIN],
    })
    expect((await stat(join(places.hostDir, 'run-host.sh'))).mode & 0o777).toBe(0o700)
    expect(await extensionBuildIn(places.extensionDir)).toBe('b1')

    // Человек положил свой файл в папку расширения - та же сборка её не перезаписывает.
    await writeFile(join(places.extensionDir, 'note.txt'), 'x')
    await installBridge(await source('b1'), places, '/bin/ide', [manifests])
    expect(await readFile(join(places.extensionDir, 'note.txt'), 'utf8')).toBe('x')

    // Новая сборка - папка заменяется целиком.
    await installBridge(await source('b2'), places, '/bin/ide', [manifests])
    expect(await extensionBuildIn(places.extensionDir)).toBe('b2')
    await expect(stat(join(places.extensionDir, 'note.txt'))).rejects.toThrow()

    await uninstallBridge(places, [manifests])
    await expect(
      stat(join(manifests, 'com.agentic_workstation.browser_dev.json')),
    ).rejects.toThrow()
    await expect(stat(places.hostDir)).rejects.toThrow()
    expect(await extensionBuildIn(places.extensionDir)).toBe('b2')
  })

  it('манифесты - только браузерам, которые установлены', async () => {
    await mkdir(join(dir, 'Google/Chrome'), { recursive: true })
    await mkdir(join(dir, 'Arc/User Data'), { recursive: true })

    expect(browserManifestDirs(dir)).toEqual([
      join(dir, 'Google/Chrome/NativeMessagingHosts'),
      join(dir, 'Arc/User Data/NativeMessagingHosts'),
    ])
  })
})

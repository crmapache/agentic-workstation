import { execFile } from 'node:child_process'
import { rm, stat, lstat, mkdir, mkdtemp, readFile, readlink, writeFile } from 'node:fs/promises'
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
      // Папку расширения выбирают в окне Chrome - она видимая, не в скрытой .agentic-workstation.
      extensionDir: '/Users/u/Agentic Workstation/Chrome Extension',
      legacyExtensionDir: '/Users/u/.agentic-workstation/chrome-extension',
    })
    expect(dev.socketPath).toBe('/Users/u/.agentic-workstation/browser/dev.sock')
    expect(copy.channel).toBe('dev')
    expect(copy.socketPath).toMatch(/browser\/dev-[0-9a-f]{8}\.sock$/)
    expect(copy.extensionDir).toMatch(/chrome-extension-dev-[0-9a-f]{8}$/)
    expect(copy.legacyExtensionDir).toBeNull()
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
      legacyExtensionDir: null,
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

describe('переезд папки расширения из скрытой в видимую', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-move-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const shipped = async () => {
    const extensionDir = join(dir, 'dist')

    await mkdir(extensionDir, { recursive: true })
    await writeFile(join(extensionDir, 'build.json'), JSON.stringify({ build: 'b1' }))
    await writeFile(join(extensionDir, 'manifest.json'), '{}')
    await writeFile(join(dir, 'host.js'), '')

    return { hostJs: join(dir, 'host.js'), extensionDir }
  }

  const placesIn = () => ({
    channel: 'dev' as const,
    socketPath: '/tmp/x.sock',
    hostDir: join(dir, 'home/.agentic-workstation/native-host/dev'),
    extensionDir: join(dir, 'home/Agentic Workstation/Chrome Extension'),
    legacyExtensionDir: join(dir, 'home/.agentic-workstation/chrome-extension'),
  })

  it('старая скрытая папка становится ссылкой на новую: загруженное оттуда расширение живо', async () => {
    const places = placesIn()

    await mkdir(places.legacyExtensionDir, { recursive: true })
    await writeFile(join(places.legacyExtensionDir, 'build.json'), JSON.stringify({ build: 'b0' }))

    await installBridge(await shipped(), places, '/bin/ide', [])

    expect((await lstat(places.legacyExtensionDir)).isSymbolicLink()).toBe(true)
    expect(await readlink(places.legacyExtensionDir)).toBe(places.extensionDir)
    expect(await extensionBuildIn(places.legacyExtensionDir)).toBe('b1')
    expect(await extensionBuildIn(places.extensionDir)).toBe('b1')

    // Повтор ничего не ломает: ссылка остаётся ссылкой.
    await installBridge(await shipped(), places, '/bin/ide', [])
    expect((await lstat(places.legacyExtensionDir)).isSymbolicLink()).toBe(true)
  })

  it('старой папки не было - ссылку не заводим', async () => {
    const places = placesIn()

    await installBridge(await shipped(), places, '/bin/ide', [])

    await expect(lstat(places.legacyExtensionDir)).rejects.toThrow()
    expect(await extensionBuildIn(places.extensionDir)).toBe('b1')
  })
})

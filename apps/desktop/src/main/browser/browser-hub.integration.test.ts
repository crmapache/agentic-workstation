import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { rm, stat, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, afterEach, beforeAll } from 'vitest'

import { encodeFrame, FrameDecoder } from '@agentic-workstation/browser-protocol/framing'
import type { EventMessage } from '@agentic-workstation/browser-protocol/protocol'

import { buildNativeHost } from '../../../native-host.vite'
import { BrowserError } from './browser-error'
import { BrowserHub } from './browser-hub'

const ROOT = join(import.meta.dirname, '../../..')

type Message = Record<string, unknown>

/** Chrome глазами host: пишет кадры в stdin, читает кадры из stdout. */
class FakeChrome {
  readonly received: Message[] = []
  private readonly waiters: (() => void)[] = []
  readonly exited: Promise<number | null>

  constructor(readonly host: ChildProcessWithoutNullStreams) {
    const frames = new FrameDecoder()

    host.stdout.on('data', (chunk: Buffer) => {
      for (const message of frames.push(chunk)) this.received.push(message as Message)

      for (const wake of this.waiters.splice(0)) wake()
    })
    this.exited = new Promise((resolve) => host.on('exit', resolve))
  }

  send(message: unknown): void {
    this.host.stdin.write(encodeFrame(message))
  }

  /** Следующее сообщение, подходящее под условие (уже пришедшие тоже считаются и забираются). */
  async next(match: (message: Message) => boolean, timeoutMs = 5000): Promise<Message> {
    const deadline = Date.now() + timeoutMs

    for (;;) {
      const index = this.received.findIndex(match)

      if (index >= 0) return this.received.splice(index, 1)[0] as Message

      if (Date.now() > deadline) throw new Error('FakeChrome: no matching message')

      await new Promise<void>((resolve) => {
        this.waiters.push(resolve)
        setTimeout(resolve, 100)
      })
    }
  }
}

const status = (value: string) => (message: Message) =>
  message['type'] === 'host' && message['status'] === value

const HELLO = {
  type: 'hello',
  profileKey: 'test1234',
  profileName: 'Work',
  browser: 'Chromium',
  version: '0.1.0',
  build: 'b0',
  launch: 'run1',
}

describe('BrowserHub и настоящий native host', () => {
  let dir = ''
  let hostJs = ''
  let socketPath = ''
  let socketDir = ''
  let hub: BrowserHub
  let chrome: FakeChrome | null = null

  const newHub = () =>
    new BrowserHub({
      channel: 'dev',
      ideVersion: '9.9.9',
      extensionBuild: () => 'b1',
      identify: (key) => Promise.resolve(key === 'test1234' ? 'Improving' : null),
      helloTimeoutMs: 2000,
    })

  const startHost = (keyPath?: string) => {
    const child = spawn(process.execPath, [
      hostJs,
      '--socket',
      socketPath,
      ...(keyPath ? ['--key', keyPath] : []),
      'chrome-extension://x/',
    ])

    chrome = new FakeChrome(child)

    return chrome
  }

  const connectProfile = async (fake: FakeChrome) => {
    await fake.next(status('connected'))
    fake.send(HELLO)
    await fake.next((message) => message['type'] === 'welcome')
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-host-'))
    hostJs = await buildNativeHost(ROOT, join(dir, 'host'))
    // Путь сокета короткий: у macOS предел 104 байта, а tmpdir() длинный.
    socketDir = await mkdtemp('/tmp/aw-')
    socketPath = join(socketDir, 'hub.sock')
  }, 60_000)

  afterEach(async () => {
    chrome?.host.kill()
    chrome = null
    await hub.stop()
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
    await rm(socketDir, { recursive: true, force: true })
  })

  it('говорит «IDE нет», пока сокета нет, и подключается, когда он появился', async () => {
    hub = newHub()

    const fake = startHost()

    await fake.next(status('ide-offline'))
    await hub.start(socketPath)
    expect((await stat(socketPath)).mode & 0o777).toBe(0o600)
    await fake.next(status('connected'))
    fake.send(HELLO)

    const welcome = await fake.next((message) => message['type'] === 'welcome')

    expect(welcome).toMatchObject({
      channel: 'dev',
      ideVersion: '9.9.9',
      extensionBuild: 'b1',
      chromeProfile: 'Improving',
    })
    expect(hub.profiles()).toMatchObject([
      { key: 'test1234', name: 'Work', chromeProfile: 'Improving', browser: 'Chromium' },
    ])

    // Имя, которое дал человек, снято: копия зовётся своим профилем Chrome, а не браузером.
    fake.send({ type: 'event', name: 'profile-renamed', data: { name: 'Chromium', named: false } })
    await expect.poll(() => hub.profiles()[0]?.name).toBe('Improving')
  })

  it('профиль Chrome не успел к ответу на hello - имя досылается расширению отдельно', async () => {
    hub = new BrowserHub({
      channel: 'dev',
      ideVersion: '9.9.9',
      extensionBuild: () => 'b1',
      identify: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('Improving'), 300)
        }),
      identifyTimeoutMs: 20,
      helloTimeoutMs: 2000,
    })
    await hub.start(socketPath)

    const fake = startHost()

    await fake.next(status('connected'))
    fake.send({ ...HELLO, profileName: 'Chromium', named: false })

    const welcome = await fake.next((message) => message['type'] === 'welcome')

    expect(welcome['chromeProfile']).toBeNull()
    expect(hub.profiles()[0]?.name).toBe('Chromium')

    const late = await fake.next(
      (message) => message['type'] === 'request' && message['method'] === 'profile.chrome',
    )

    expect(late['params']).toEqual({ name: 'Improving' })
    expect(hub.profiles()[0]?.name).toBe('Improving')
  })

  it('с ключом моста (Windows, ADR 0048): свой host проходит проверку, чужой - нет', async () => {
    const keyPath = join(dir, 'bridge.key')
    const wrongPath = join(dir, 'wrong.key')

    await writeFile(keyPath, 'a'.repeat(64))
    await writeFile(wrongPath, 'b'.repeat(64))
    hub = newHub()
    await hub.start(socketPath, 'a'.repeat(64))

    const own = startHost(keyPath)

    await connectProfile(own)
    expect(hub.profiles()).toMatchObject([{ key: 'test1234' }])
    own.host.kill()

    const stranger = startHost(wrongPath)

    await expect(stranger.next(status('connected'), 1500)).rejects.toThrow()
    expect(hub.profiles()).toEqual([])
  })

  it('запрос, ответ, отказ, событие и тайм-аут', async () => {
    hub = newHub()
    await hub.start(socketPath)

    const fake = startHost()
    const events: EventMessage[] = []

    hub.onEvent((_key, event) => events.push(event))
    await connectProfile(fake)

    const answer = hub.request('test1234', 'tabs.get', { tabId: 7 })
    const request = await fake.next((message) => message['type'] === 'request')

    expect(request).toMatchObject({ method: 'tabs.get', params: { tabId: 7 } })
    fake.send({ type: 'response', id: request['id'], result: { tabId: 7, title: 'T' } })
    await expect(answer).resolves.toEqual({ tabId: 7, title: 'T' })

    const refused = hub.request('test1234', 'debugger.attach', { tabId: 1 })
    const second = await fake.next((message) => message['type'] === 'request')

    fake.send({ type: 'response', id: second['id'], error: { code: 'no-tab', message: 'gone' } })
    await expect(refused).rejects.toMatchObject({ code: 'no-tab', message: 'gone' })

    fake.send({ type: 'event', name: 'tab-removed', data: { tabId: 3 } })
    await expect
      .poll(() => events)
      .toEqual([{ type: 'event', name: 'tab-removed', data: { tabId: 3 } }])

    await expect(
      hub.request('test1234', 'tabs.get', { tabId: 1 }, { timeoutMs: 200 }),
    ).rejects.toMatchObject({ code: 'timeout' })
  })

  it('запрос больше 1 МБ host не пересылает в Chrome, а отказывает', async () => {
    hub = newHub()
    await hub.start(socketPath)

    const fake = startHost()

    await connectProfile(fake)

    const huge = 'x'.repeat(1024 * 1024 + 10)

    await expect(
      hub.request('test1234', 'cdp', { tabId: 1, method: 'Runtime.evaluate', params: { huge } }),
    ).rejects.toMatchObject({ code: 'bad-request' })
    expect(fake.received.filter((message) => message['type'] === 'request')).toEqual([])
  })

  it('IDE перезапустилась - host переподключается, профиль возвращается', async () => {
    hub = newHub()
    await hub.start(socketPath)

    const fake = startHost()

    await connectProfile(fake)
    await hub.stop()
    await fake.next(status('ide-offline'))
    await expect(hub.request('test1234', 'tabs.get', { tabId: 1 })).rejects.toBeInstanceOf(
      BrowserError,
    )

    hub = newHub()
    await hub.start(socketPath)
    await connectProfile(fake)
    expect(hub.profiles().map((profile) => profile.key)).toEqual(['test1234'])
  })

  it('id запросов новой связи начинаются не с 1 и не там же, где у прежней', async () => {
    hub = newHub()
    await hub.start(socketPath)

    const links: [string, boolean][] = []

    hub.onLink((key, up) => links.push([key, up]))

    const firstIds: number[] = []

    for (let round = 0; round < 2; round += 1) {
      const fake = startHost()

      await connectProfile(fake)
      void hub.request('test1234', 'tabs.get', { tabId: 1 }, { timeoutMs: 1000 }).catch(() => null)
      firstIds.push(Number((await fake.next((message) => message['type'] === 'request'))['id']))
      fake.host.kill()
      await expect.poll(() => hub.profiles()).toEqual([])
    }

    expect(firstIds.every((id) => id > 1 && Number.isSafeInteger(id))).toBe(true)
    expect(firstIds[0]).not.toBe(firstIds[1])
    expect(hub.profile('test1234')).toBeNull()
    expect(links).toEqual([
      ['test1234', true],
      ['test1234', false],
      ['test1234', true],
      ['test1234', false],
    ])
  })

  it('Chrome закрыл порт - host выходит, профиль пропадает', async () => {
    hub = newHub()
    await hub.start(socketPath)

    const fake = startHost()

    await connectProfile(fake)
    fake.host.stdin.end()
    expect(await fake.exited).toBe(0)
    await expect.poll(() => hub.profiles()).toEqual([])
  })

  it('связь без hello рвётся по тайм-ауту', async () => {
    hub = newHub()
    await hub.start(socketPath)

    const fake = startHost()

    await fake.next(status('connected'))
    await fake.next(status('ide-offline'), 5000)
    expect(hub.profiles()).toEqual([])
  })
})

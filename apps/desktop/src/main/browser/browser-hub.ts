import { chmod, lstat, mkdir, unlink } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import type { Server, Socket } from 'node:net'
import { dirname } from 'node:path'

import type {
  HostChannel,
  EventMessage,
  HelloMessage,
  BrowserMethod,
  BrowserMethods,
} from '@agentic-workstation/browser-protocol/protocol'
import { PROFILE_KEY_PATTERN } from '@agentic-workstation/browser-protocol/tab-reference'

import { BrowserError } from './browser-error'
import { HubLink } from './hub-link'

/** Подключённый профиль Chrome: одна связь расширения через свой процесс native host. */
export type BrowserProfile = {
  key: string
  name: string
  browser: string
  version: string
  build: string
  /** Метка запуска Chrome (HelloMessage.launch): по ней отличаются старые ссылки на вкладки. */
  launch: string
  connectedAt: number
}

export type HubOptions = {
  channel: HostChannel
  ideVersion: string
  /** Сборка расширения, которую IDE положила в папку: расширение сверит свою. */
  extensionBuild: () => string | null
  helloTimeoutMs?: number
  requestTimeoutMs?: number
}

export type HubEventListener = (profileKey: string, event: EventMessage) => void

/**
 * Профиль поднялся (hello - и тогда, когда новая связь того же профиля вытеснила прежнюю:
 * расширение перезагрузилось) или ушёл. Агенту браузера это важнее списка: после нового hello
 * его отладчики в профиле сняты, а вкладки надо сверить заново.
 */
export type HubLinkListener = (profileKey: string, up: boolean) => void

/** Ждать hello от нового host: процесс уже запущен Chrome, ответ - миллисекунды. */
const HELLO_TIMEOUT_MS = 10_000

/** Обычный запрос к расширению: команда CDP или вкладка - доли секунды, с большим запасом. */
export const REQUEST_TIMEOUT_MS = 30_000

const profileOf = (hello: HelloMessage): BrowserProfile => ({
  key: hello.profileKey,
  name: hello.profileName,
  browser: hello.browser,
  version: hello.version,
  build: hello.build,
  launch: hello.launch,
  connectedAt: Date.now(),
})

/**
 * Связь IDE с расширениями (ADR 0040): unix-сокет, к которому подключаются процессы native
 * host - по одному на профиль Chrome с расширением. Профиль узнаётся по hello; второй host
 * того же профиля (Chrome перезапустил его) вытесняет первый. Сокет - права 600 в папке 700:
 * подключиться может только этот пользователь.
 */
export class BrowserHub {
  private server: Server | null = null
  private readonly links = new Set<HubLink>()
  private readonly byKey = new Map<string, HubLink>()
  private readonly eventListeners = new Set<HubEventListener>()
  private readonly profileListeners = new Set<() => void>()
  private readonly linkListeners = new Set<HubLinkListener>()

  constructor(private readonly options: HubOptions) {}

  get isRunning(): boolean {
    return this.server !== null
  }

  /**
   * Открыть сокет. Путь приходит сюда, а не в конструктор: связь нужна коннектору с первой
   * секунды, а место сокета считается, только когда человек включил Browser.
   */
  async start(socketPath: string): Promise<void> {
    if (this.server) return

    await ensurePrivateDir(dirname(socketPath))
    await removeStaleSocket(socketPath)

    const server = createServer((socket) => this.accept(socket))

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, () => {
        server.off('error', reject)
        resolve()
      })
    })
    await chmod(socketPath, 0o600)
    server.on('error', (error) => console.warn('[browser] сокет расширений', error))
    this.server = server
  }

  async stop(): Promise<void> {
    const server = this.server

    this.server = null

    for (const link of [...this.links]) link.close()

    if (server) await new Promise((resolve) => server.close(resolve))
  }

  profiles(): BrowserProfile[] {
    return [...this.byKey.values()].flatMap((link) => (link.hello ? [profileOf(link.hello)] : []))
  }

  profile(key: string): BrowserProfile | null {
    const hello = this.byKey.get(key)?.hello

    return hello ? profileOf(hello) : null
  }

  request<M extends BrowserMethod>(
    profileKey: string,
    method: M,
    params: BrowserMethods[M]['params'],
    options: { timeoutMs?: number; signal?: AbortSignal | undefined } = {},
  ): Promise<BrowserMethods[M]['result']> {
    const link = this.byKey.get(profileKey)

    if (!link) {
      return Promise.reject(
        new BrowserError('profile-offline', `Chrome profile ${profileKey} is not connected.`),
      )
    }

    return link.request(
      method,
      params,
      options.timeoutMs ?? this.options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
      options.signal,
    )
  }

  onEvent(listener: HubEventListener): () => void {
    this.eventListeners.add(listener)

    return () => this.eventListeners.delete(listener)
  }

  /** Подключился, отключился или переименован профиль. */
  onProfiles(listener: () => void): () => void {
    this.profileListeners.add(listener)

    return () => this.profileListeners.delete(listener)
  }

  onLink(listener: HubLinkListener): () => void {
    this.linkListeners.add(listener)

    return () => this.linkListeners.delete(listener)
  }

  private accept(socket: Socket): void {
    const link = new HubLink(
      socket,
      {
        hello: (from, hello) => this.hello(from, hello),
        event: (from, event) => this.event(from, event),
        closed: (from) => this.closed(from),
      },
      this.options.helloTimeoutMs ?? HELLO_TIMEOUT_MS,
    )

    this.links.add(link)
  }

  private hello(link: HubLink, hello: HelloMessage): void {
    if (!PROFILE_KEY_PATTERN.test(hello.profileKey)) {
      link.close()

      return
    }

    const previous = this.byKey.get(hello.profileKey)

    this.byKey.set(hello.profileKey, link)

    if (previous && previous !== link) previous.close()

    link.send({
      type: 'welcome',
      channel: this.options.channel,
      ideVersion: this.options.ideVersion,
      extensionBuild: this.options.extensionBuild(),
    })
    this.profilesChanged()

    for (const listener of this.linkListeners) listener(hello.profileKey, true)
  }

  private event(link: HubLink, event: EventMessage): void {
    const key = link.hello?.profileKey

    if (!key || this.byKey.get(key) !== link) return

    if (event.name === 'profile-renamed' && link.hello) {
      link.hello = { ...link.hello, profileName: event.data.name.slice(0, 80) }
      this.profilesChanged()
    }

    for (const listener of this.eventListeners) listener(key, event)
  }

  private closed(link: HubLink): void {
    this.links.delete(link)

    const key = link.hello?.profileKey

    if (key && this.byKey.get(key) === link) {
      this.byKey.delete(key)
      this.profilesChanged()

      for (const listener of this.linkListeners) listener(key, false)
    }
  }

  private profilesChanged(): void {
    for (const listener of this.profileListeners) listener()
  }
}

/** Что агенту браузера нужно от связи с расширениями: в тестах её заменяет подделка. */
export type HubPort = Pick<
  BrowserHub,
  'request' | 'profiles' | 'profile' | 'onEvent' | 'onProfiles' | 'onLink'
>

/**
 * Папка сокета - только своя: создать с правами 700 и проверить, что это настоящая папка
 * (не ссылка) этого пользователя. Во временной папке (запасное место сокета) её мог заранее
 * создать другой пользователь машины - тогда сокет не открывается, а не слушает в чужой папке.
 */
export const ensurePrivateDir = async (dir: string): Promise<void> => {
  await mkdir(dir, { recursive: true, mode: 0o700 })

  const info = await lstat(dir)
  const uid = process.getuid?.()

  if (!info.isDirectory() || (uid !== undefined && info.uid !== uid)) {
    throw new Error(`The socket folder ${dir} is not a private folder of this user.`)
  }

  await chmod(dir, 0o700)
}

/**
 * Файл сокета от прошлого запуска (IDE упала): живого слушателя за ним нет - удалить. Живой
 * слушатель - другой процесс этого же профиля IDE, чего блокировка экземпляра не допускает;
 * тогда listen упадёт с EADDRINUSE, и это честнее, чем отнять у него сокет.
 */
const removeStaleSocket = async (path: string): Promise<void> => {
  const alive = await new Promise<boolean>((resolve) => {
    const probe = connect(path)

    probe.once('connect', () => {
      probe.destroy()
      resolve(true)
    })
    probe.once('error', () => resolve(false))
  })

  if (!alive) await unlink(path).catch(() => undefined)
}

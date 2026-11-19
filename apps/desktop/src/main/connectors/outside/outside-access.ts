import { createHash, timingSafeEqual } from 'node:crypto'

import type { OutsideCopy, OutsideStatus, OutsideAccessState } from '@shared/connectors'

import { ConnectorGateway } from '../gateway/gateway'
import type { GatewayServer } from '../gateway/gateway'
import type { Launch } from '../gateway/launches'
import { randomToken } from '../oauth/pkce'
import type { JsonFile } from '../../storage/json-file'
import type { Vault } from '../../storage/vault'
import { outsideSetup } from './outside-setup'

/** Что лежит на диске: только «включён ли»; ключ - в хранилище. */
export type StoredOutside = { enabled: boolean }

/** Ключ входа снаружи в хранилище секретов. */
const KEY_NAME = 'workstation:outside-key'

/**
 * Вызов снаружи - процесс без проекта и разговора: проект инструменты берут из аргументов, а
 * разговора, которому что-то вернуть, у него нет.
 */
const OUTSIDE_LAUNCH: Launch = {
  id: 'outside',
  projectPath: '',
  workDir: '',
  conversationId: null,
  released: false,
}

const digest = (token: string): Buffer => createHash('sha256').update(token).digest()

export type OutsideDeps = {
  file: JsonFile<StoredOutside>
  vault: Vault
  port: number
  version: string
  /** Сервер самой IDE и его имя; коннектора нет - null (шлюз ответит 404). */
  server: (launch: Launch) => { name: string; server: GatewayServer } | null
  changed: () => void
}

/**
 * Вход в IDE снаружи (ADR 0090): сервер workstation на постоянном порту 127.0.0.1 для агентов вне
 * IDE - Claude Code в терминале, Codex, любой клиент MCP. Выключен, пока человек не включит; пускает
 * только с ключом из хранилища (сравнение хешей за постоянное время) и только с Host этого адреса.
 * Новый ключ сразу отрезает клиентов со старым.
 */
export class OutsideAccess {
  private gateway: ConnectorGateway<Launch> | null = null
  private enabled = false
  private status: OutsideStatus = 'off'

  constructor(private readonly deps: OutsideDeps) {}

  /** Включённый в прошлый раз - поднять снова. */
  async load(): Promise<void> {
    const stored = await this.deps.file.read().catch(() => null)

    this.enabled =
      typeof stored === 'object' &&
      stored !== null &&
      'enabled' in stored &&
      stored.enabled === true

    if (this.enabled) await this.start()
  }

  state(): OutsideAccessState {
    return {
      enabled: this.enabled,
      status: this.status,
      url: this.url(),
      vault: this.deps.vault.available,
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled && !this.deps.vault.available) return
    if (enabled === this.enabled) return

    this.enabled = enabled
    await this.deps.file.write({ enabled })

    if (enabled) await this.start()
    else await this.stop()

    this.deps.changed()
  }

  /** Новый ключ: клиенты со старым получают 401, пока человек не впишет новый. */
  async renewKey(): Promise<void> {
    if (!this.deps.vault.available) return

    await this.deps.vault.set(KEY_NAME, randomToken())
  }

  /** Текст для чужого клиента с ключом - в буфер обмена; окну ключ не уходит. */
  async setupText(what: OutsideCopy): Promise<string | null> {
    const key = await this.key()

    return key && outsideSetup(what, this.url(), key)
  }

  async stop(): Promise<void> {
    const gateway = this.gateway

    this.gateway = null
    this.status = 'off'
    await gateway?.stop()
  }

  private url(): string {
    const name = this.deps.server(OUTSIDE_LAUNCH)?.name ?? 'workstation'

    return `http://127.0.0.1:${this.deps.port}/mcp/${name}`
  }

  /** Ключ из хранилища; нет - заводится. Без шифрования - null: открытым текстом не пишем. */
  private async key(): Promise<string | null> {
    if (!this.deps.vault.available) return null

    const stored = this.deps.vault.get(KEY_NAME)

    if (stored) return stored

    const fresh = randomToken()

    await this.deps.vault.set(KEY_NAME, fresh)

    return fresh
  }

  private authorize(token: string): Launch | null {
    const key = this.deps.vault.get(KEY_NAME)

    return key && timingSafeEqual(digest(key), digest(token)) ? OUTSIDE_LAUNCH : null
  }

  private async start(): Promise<void> {
    if (this.gateway) return

    // Ключ - до первого клиента: без него шлюз не пустил бы никого.
    if (!(await this.key())) {
      this.status = 'failed'

      return
    }

    const gateway = new ConnectorGateway<Launch>(
      {
        authorize: (token) => this.authorize(token),
        resolve: (name, launch) => {
          const own = this.deps.server(launch)

          return own?.name === name ? own.server : null
        },
      },
      this.deps.version,
      this.deps.port,
    )

    try {
      await gateway.start()
      this.gateway = gateway
      this.status = 'on'
    } catch (error) {
      const busy = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'

      this.status = busy ? 'port-busy' : 'failed'
      console.warn('[connectors] вход снаружи не поднялся', error)
    }
  }
}

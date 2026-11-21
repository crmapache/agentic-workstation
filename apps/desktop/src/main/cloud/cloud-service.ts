import type { CloudState, CloudKeyOutcome } from '@shared/tracker'

import type { CloudAccount } from '@agentic-workstation/cloud-protocol/node-account'
import {
  accountOf,
  accountIdOf,
  parseAccountKey,
  formatAccountKey,
  newAccountSecret,
} from '@agentic-workstation/cloud-protocol/node-account'
import { openRecord, sealRecord } from '@agentic-workstation/cloud-protocol/node-seal'

import type { JsonFile } from '../storage/json-file'
import type { Vault } from '../storage/vault'
import type { TrackerBook } from '../tracker/tracker-book'
import type { CloudTransport } from './cloud-client'
import type { SyncReport } from './cloud-sync'
import { CloudSync } from './cloud-sync'

/** Настройки облака этого компьютера: ключ - в хранилище секретов, здесь только отметки. */
export type StoredCloud = { enabled: boolean; keySaved: boolean }

export type CloudServiceOptions = {
  vault: Vault
  file: JsonFile<StoredCloud>
  book: TrackerBook
  transportFor: (account: CloudAccount) => CloudTransport
  onState: (state: CloudState) => void
  writeClipboard: (text: string) => Promise<void>
  /** Паузы и ожидание синхронизации - тестам покороче. */
  sync?: { waitSeconds?: number; backoffMs?: readonly number[] }
}

const SECRET_KEY = 'cloud:account-secret'

/**
 * Облако IDE (ADR 0102): ключ аккаунта создаётся сам при первом запуске, и доска сразу
 * уезжает в облако шифром. Окно ключа не видит: копирует его главный процесс в буфер, а
 * чужой ключ (второй компьютер) приходит строкой и проверяется здесь. Без связки ключей
 * (safeStorage недоступен) облако не включается: секрет открытым текстом на диск не ляжет.
 */
export class CloudService {
  private account: CloudAccount | null = null
  private sync: CloudSync | null = null
  private report: SyncReport = { online: false, failure: null, lastSyncAt: null }
  /** Синхронизация уже пробовала: без связи это «offline», а не «connecting». */
  private tried = false
  /** Последнее состояние, ушедшее в окно: одинаковое второй раз не шлётся. */
  private sent = ''

  private constructor(
    private readonly options: CloudServiceOptions,
    private prefs: StoredCloud,
  ) {
    options.book.onChange((change) => {
      if (change === 'local') this.sync?.kick()

      this.emit()
    })
  }

  static async load(options: CloudServiceOptions): Promise<CloudService> {
    const raw = (await options.file.read()) as Partial<StoredCloud> | null
    const service = new CloudService(options, {
      enabled: raw?.enabled !== false,
      keySaved: raw?.keySaved === true,
    })

    await service.connect()

    return service
  }

  state(): CloudState {
    const enabled = this.prefs.enabled
    const status = !enabled
      ? 'off'
      : !this.account
        ? 'error'
        : this.report.failure
          ? 'error'
          : !this.report.online
            ? this.tried
              ? 'offline'
              : 'connecting'
            : this.options.book.pending > 0
              ? 'syncing'
              : 'synced'

    return {
      status,
      accountId: this.account ? accountIdOf(this.account.publicKey) : null,
      keySaved: this.prefs.keySaved,
      lastSyncAt: this.report.lastSyncAt,
      pending: this.options.book.pending,
      failure: enabled && !this.account ? 'noKeychain' : this.report.failure,
    }
  }

  /** Скопировать ключ аккаунта в буфер: его вводят на втором компьютере. */
  async copyKey(): Promise<CloudState> {
    if (!this.account) return this.state()

    await this.options.writeClipboard(formatAccountKey(this.account.secret))
    await this.savePrefs({ keySaved: true })

    return this.state()
  }

  /** Перейти на ключ другого компьютера: своя доска сольётся с его облаком. */
  async useKey(text: string): Promise<CloudKeyOutcome> {
    const secret = parseAccountKey(text)

    if (!secret) return { ok: false, code: 'badKey' }
    if (!this.options.vault.available) return { ok: false, code: 'noKeychain' }

    await this.options.vault.set(SECRET_KEY, secret.toString('base64url'))
    await this.savePrefs({ keySaved: true, enabled: true })
    await this.connect()

    return { ok: true, state: this.state() }
  }

  async setEnabled(enabled: boolean): Promise<CloudState> {
    await this.savePrefs({ enabled })
    await this.connect()

    return this.state()
  }

  close() {
    this.sync?.stop()
    this.sync = null
  }

  /** Поднять синхронизацию с текущим ключом (или погасить, если облако выключено). */
  private async connect() {
    this.close()
    this.account = null
    this.report = { online: false, failure: null, lastSyncAt: null }
    this.tried = false

    if (this.prefs.enabled) {
      const account = await this.loadAccount()

      if (account) {
        const accountId = accountIdOf(account.publicKey)

        if (this.options.book.account !== accountId) this.options.book.switchAccount(accountId)

        this.account = account
        this.sync = new CloudSync({
          collection: this.options.book,
          transport: this.options.transportFor(account),
          seal: {
            seal: (id, text) => sealRecord(account.sealKey, id, text),
            open: (id, blob) => openRecord(account.sealKey, id, blob),
          },
          onReport: (report) => {
            this.report = report
            this.tried = true
            this.emit()
          },
          ...this.options.sync,
        })
        this.sync.start()
      }
    }

    this.emit()
  }

  private async loadAccount(): Promise<CloudAccount | null> {
    const { vault } = this.options
    const stored = vault.get(SECRET_KEY)

    if (stored) return accountOf(Buffer.from(stored, 'base64url'))
    if (!vault.available) return null

    const secret = newAccountSecret()

    await vault.set(SECRET_KEY, secret.toString('base64url'))

    return accountOf(secret)
  }

  private async savePrefs(change: Partial<StoredCloud>) {
    this.prefs = { ...this.prefs, ...change }
    await this.options.file.write(this.prefs)
  }

  private emit() {
    const state = this.state()
    const text = JSON.stringify(state)

    if (text === this.sent) return

    this.sent = text
    this.options.onState(state)
  }
}

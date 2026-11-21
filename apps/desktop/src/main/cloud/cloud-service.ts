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
  /** Показать ключ человеку окном главного процесса; true - он его скопировал. */
  revealKey: (key: string) => Promise<boolean>
  /** Спросить человека, переходить ли на другой аккаунт (from null - старого ключа нет). */
  confirmSwitch: (from: string | null, to: string) => Promise<boolean>
  /** Облако включено по умолчанию; копия IDE для проверок без своего адреса - выключено. */
  enabledByDefault?: boolean
  /** Первый удачный заход синхронизации: книга сверена с облаком. */
  onSynced?: () => void
  /** Паузы и ожидание синхронизации - тестам покороче. */
  sync?: { waitSeconds?: number; backoffMs?: readonly number[] }
}

const SECRET_KEY = 'cloud:account-secret'
/** Прежний ключ после смены: ошибочная смена не теряет его насовсем. */
const PREVIOUS_KEY = 'cloud:previous-secret'

/**
 * Облако IDE (ADR 0102): ключ аккаунта создаётся сам при первом запуске, и доска сразу
 * уезжает в облако шифром. Окно ключа не видит: показывает его человеку окно главного процесса,
 * а чужой ключ (второй компьютер) приходит строкой и принимается только после ответа человека в
 * системном окне. Без связки ключей облако не включается: секрет открытым текстом на диск не
 * ляжет. Ключ пропал (связка ключей сменилась), а книга уже жила в аккаунте - нового тихо не
 * заводится: тогда машины молча разошлись бы по разным аккаунтам.
 */
export class CloudService {
  private account: CloudAccount | null = null
  private sync: CloudSync | null = null
  private report: SyncReport = { online: false, failure: null, lastSyncAt: null }
  /** Синхронизация уже пробовала: без связи это «offline», а не «connecting». */
  private tried = false
  /** Последнее состояние, ушедшее в окно: одинаковое второй раз не шлётся. */
  private sent = ''
  /** Ключ аккаунта пропал из хранилища: ждём ключ от человека или его «начать заново». */
  private lost = false

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
      enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : options.enabledByDefault !== false,
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
      failure:
        enabled && !this.account ? (this.lost ? 'keyLost' : 'noKeychain') : this.report.failure,
    }
  }

  /** Показать ключ аккаунта (его вводят на втором компьютере); скопировал - ключ сохранён. */
  async copyKey(): Promise<CloudState> {
    if (!this.account) return this.state()

    if (await this.options.revealKey(formatAccountKey(this.account.secret)))
      await this.savePrefs({ keySaved: true })

    this.emit()

    return this.state()
  }

  /**
   * Перейти на ключ другого компьютера: своя доска сольётся с его облаком. Только после «да»
   * человека в окне главного процесса - окно IDE само сменить аккаунт не может.
   */
  async useKey(text: string): Promise<CloudKeyOutcome> {
    const secret = parseAccountKey(text)

    if (!secret) return { ok: false, code: 'badKey' }
    if (!this.options.vault.available) return { ok: false, code: 'noKeychain' }

    const to = accountIdOf(accountOf(secret).publicKey)
    const from = this.account ? accountIdOf(this.account.publicKey) : null

    if (from === to) return { ok: true, state: this.state() }
    if (!(await this.options.confirmSwitch(from, to))) return { ok: false, code: 'cancelled' }

    await this.replaceSecret(secret)
    await this.savePrefs({ keySaved: true, enabled: true })
    await this.connect()

    return { ok: true, state: this.state() }
  }

  /** Ключ пропал, и вернуть его нечем: новый аккаунт, доска этой машины уйдёт в него. */
  async startOver(): Promise<CloudKeyOutcome> {
    if (!this.options.vault.available) return { ok: false, code: 'noKeychain' }

    const secret = newAccountSecret()

    if (!(await this.options.confirmSwitch(null, accountIdOf(accountOf(secret).publicKey))))
      return { ok: false, code: 'cancelled' }

    await this.replaceSecret(secret)
    await this.savePrefs({ keySaved: false, enabled: true })
    await this.connect()

    return { ok: true, state: this.state() }
  }

  async setEnabled(enabled: boolean): Promise<CloudState> {
    await this.savePrefs({ enabled })
    await this.connect()

    return this.state()
  }

  /** Погасить синхронизацию и дождаться конца её захода. */
  async close() {
    const sync = this.sync

    this.sync = null
    await sync?.stop()
  }

  /** Поднять синхронизацию с текущим ключом (или погасить, если облако выключено). */
  private async connect() {
    await this.close()
    this.account = null
    this.lost = false
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
            if (report.online && !this.report.online) this.options.onSynced?.()

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
    const { vault, book } = this.options
    const stored = vault.get(SECRET_KEY)

    if (stored) return accountOf(Buffer.from(stored, 'base64url'))
    if (!vault.available) return null

    // Книга уже жила в аккаунте или хранилище пришлось отложить - ключ потерян, а не новый.
    if (book.account !== null || vault.wasReset) {
      this.lost = true

      return null
    }

    const secret = newAccountSecret()

    await vault.set(SECRET_KEY, secret.toString('base64url'))

    return accountOf(secret)
  }

  /** Новый ключ на место текущего; текущий - рядом, на случай ошибочной смены. */
  private async replaceSecret(secret: Buffer) {
    const { vault } = this.options
    const current = vault.get(SECRET_KEY)

    if (current) await vault.set(PREVIOUS_KEY, current)

    await vault.set(SECRET_KEY, secret.toString('base64url'))
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

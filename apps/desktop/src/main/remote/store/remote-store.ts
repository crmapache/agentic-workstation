import { randomBytes } from 'node:crypto'

import { ADDRESS_BYTES } from '@agentic-workstation/remote-protocol/frame'

import type { KeyPair } from '../wire/crypto'
import { exportPrivate, restoreKeyPair, generateKeyPair } from '../wire/crypto'
import type { JsonFile } from '../../storage/json-file'
import type { StoredDevice, StoredRemote } from './remote-state'
import { withDevice, withRevoked, parseStoredRemote } from './remote-state'

/** Системное хранилище секретов (safeStorage); в тесте - подделка. */
export type Vault = {
  available: () => boolean
  seal: (plain: Buffer) => string
  open: (sealed: string) => Buffer | null
}

/** Пауза записи: «последний раз слышали» меняется на каждом переподключении. */
const SAVE_MS = 1000

const newAgentId = (): string => randomBytes(ADDRESS_BYTES).toString('base64url')

/**
 * Телефоны, чьи секреты не открываются (хранилища нет, Mac сменился, ключ в Связке другой), -
 * в отпущенные: пара без секрета не работает, и окно не должно рисовать её живой, а телефон
 * при возвращении услышит «тебя отпустили», а не тишину.
 */
const withoutUnreadable = (stored: StoredRemote, vault: Vault): StoredRemote => {
  const readable = (id: string): boolean => {
    const sealed = stored.secrets[id]

    return vault.available() && !!sealed && vault.open(sealed) !== null
  }

  return stored.devices
    .filter((device) => !readable(device.id))
    .reduce((state, device) => withRevoked(state, device.id), stored)
}

/**
 * Что уходит в файл. Без хранилища - ни ключа, ни адреса IDE, ни телефонов: их пара живёт
 * только до перезапуска, и запись на диске обещала бы то, чего нет.
 */
const persisted = (state: StoredRemote, kept: boolean): StoredRemote =>
  kept
    ? {
        ...state,
        devices: state.devices.filter((device) => !!state.secrets[device.id]),
      }
    : { ...state, agentId: '', identity: '', devices: [], secrets: {} }

/**
 * Кто эта IDE на релее и кого пустили. Ключи - через хранилище; без него они живут только в
 * памяти, и окно честно говорит, что пара не переживёт перезапуск, а не даёт узнать это
 * повторением.
 */
export class RemoteStore {
  private identityPair: KeyPair | null = null
  /** Секреты пар, когда хранилища нет: до перезапуска IDE. */
  private readonly memorySecrets = new Map<string, Buffer>()
  private saveTimer: NodeJS.Timeout | null = null

  private constructor(
    private state: StoredRemote,
    private readonly file: JsonFile<StoredRemote>,
    private readonly vault: Vault,
  ) {}

  static async load(file: JsonFile<StoredRemote>, vault: Vault): Promise<RemoteStore> {
    const parsed = parseStoredRemote(await file.read())
    const checked = withoutUnreadable(parsed, vault)
    const store = new RemoteStore(checked, file, vault)

    if (checked.devices.length !== parsed.devices.length) {
      console.warn('[remote] секреты части телефонов не открылись - они отпущены')
      store.saveSoon(0)
    }

    return store
  }

  get enabled(): boolean {
    return this.state.enabled
  }

  get devices(): StoredDevice[] {
    return this.state.devices
  }

  /** Хранилище настоящее: пара переживёт перезапуск. */
  get keysKept(): boolean {
    return this.vault.available()
  }

  /** Ключ IDE уже есть - отпечаток можно показать, не создавая его взглядом на экран. */
  get hasIdentity(): boolean {
    return this.identityPair !== null || this.state.identity !== ''
  }

  /** Адрес IDE на релее - из одной пары с ключом: новый ключ - новый адрес. */
  agentId(): string {
    this.identity()

    return this.state.agentId
  }

  /**
   * Долгая пара ключей IDE: создаётся раз и живёт, пока человек не сменит. Не открылась
   * (хранилище сменилось, профиль перенесли на другой Mac) - новая, и с ней новый адрес на
   * релее: иначе копия профиля на втором Mac звонила бы с тем же адресом, и две IDE
   * вытесняли бы друг друга. Все телефоны спариваются заново.
   */
  identity(): KeyPair {
    if (this.identityPair) return this.identityPair

    const opened =
      this.state.identity && this.vault.available() ? this.vault.open(this.state.identity) : null
    const restored = opened ? tryRestore(opened) : null

    if (restored) {
      this.identityPair = restored

      if (!this.state.agentId) this.update({ agentId: newAgentId() })

      return restored
    }

    if (this.state.identity) console.warn('[remote] ключ IDE не открылся - новый ключ и адрес')

    const fresh = generateKeyPair()
    const kept = this.vault.available()

    this.identityPair = fresh
    this.update({
      agentId: newAgentId(),
      identity: kept ? this.vault.seal(exportPrivate(fresh.privateKey)) : '',
    })

    return fresh
  }

  /** Долгий ключ пары с телефоном; нет - телефон не спарен (или отпущен). */
  deviceSecret(deviceId: string): Buffer | null {
    if (!this.state.devices.some((device) => device.id === deviceId)) return null

    const sealed = this.state.secrets[deviceId]

    return sealed ? this.vault.open(sealed) : (this.memorySecrets.get(deviceId) ?? null)
  }

  remember(device: StoredDevice, secret: Buffer): void {
    const kept = this.vault.available()

    if (!kept) this.memorySecrets.set(device.id, secret)

    this.state = withDevice(this.state, device, kept ? this.vault.seal(secret) : '')
    this.saveSoon(0)
  }

  /** Отзыв - и есть удаление секрета: кадры телефона больше не открываются. */
  revoke(deviceId: string): void {
    this.memorySecrets.delete(deviceId)
    this.state = withRevoked(this.state, deviceId)
    this.saveSoon(0)
  }

  wasRevoked(deviceId: string): boolean {
    return this.state.revoked.includes(deviceId)
  }

  /** Телефон доказал, что это он: отметка для списка в окне. */
  touch(deviceId: string, at: number): void {
    this.state = {
      ...this.state,
      devices: this.state.devices.map((device) =>
        device.id === deviceId ? { ...device, lastSeenAt: at } : device,
      ),
    }
    this.saveSoon(SAVE_MS)
  }

  setEnabled(enabled: boolean): void {
    this.update({ enabled })
  }

  /** Записать сейчас - перед выходом из IDE. */
  async flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)

    this.saveTimer = null
    await this.file.write(persisted(this.state, this.vault.available())).catch((error: unknown) => {
      console.warn('[remote] состояние не сохранилось:', error)
    })
  }

  private update(change: Partial<StoredRemote>) {
    this.state = { ...this.state, ...change }
    this.saveSoon(0)
  }

  private saveSoon(delay: number) {
    if (this.saveTimer && delay > 0) return
    if (this.saveTimer) clearTimeout(this.saveTimer)

    this.saveTimer = setTimeout(() => void this.flush(), delay)
    this.saveTimer.unref()
  }
}

const tryRestore = (der: Buffer): KeyPair | null => {
  try {
    return restoreKeyPair(der)
  } catch {
    return null
  }
}

import type { KeyPair } from '../wire/crypto'
import {
  addressOf,
  revokedTag,
  exportPrivate,
  restoreKeyPair,
  generateKeyPair,
} from '../wire/crypto'
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

/** Ключи IDE: ECDH для пар и подпись для релея; адрес - из ключа подписи. */
type Keys = { identity: KeyPair; signing: KeyPair; agentId: string }

const keysOf = (identity: KeyPair, signing: KeyPair): Keys => ({
  identity,
  signing,
  agentId: addressOf(signing.publicKey).toString('base64url'),
})

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
    .reduce((state, device) => withRevoked(state, device.id, ''), stored)
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
    : { ...state, identity: '', signing: '', devices: [], secrets: {} }

/**
 * Кто эта IDE на релее и кого пустили. Ключи - через хранилище; без него они живут только в
 * памяти, и окно честно говорит, что пара не переживёт перезапуск, а не даёт узнать это
 * повторением.
 */
export class RemoteStore {
  private keys: Keys | null = null
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
    return this.keys !== null || this.state.identity !== ''
  }

  /** Адрес IDE на релее - начало SHA-256 её ключа подписи: новый ключ - новый адрес. */
  agentId(): string {
    return this.loadKeys().agentId
  }

  /** Долгая пара ключей ECDH IDE: ею IDE спаривается с телефонами. */
  identity(): KeyPair {
    return this.loadKeys().identity
  }

  /** Ключ подписи: им IDE доказывает релею, что адрес её (relay-claim.ts). */
  signing(): KeyPair {
    return this.loadKeys().signing
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

  /**
   * Отзыв - и есть удаление секрета: кадры телефона больше не открываются. Ответ - «тебя
   * отпустили» под долгим ключом пары (base64), посчитанный, пока ключ ещё здесь; он же ложится
   * в надгробие. Ключа нет - пусто: такому телефону сказать нечем.
   */
  revoke(deviceId: string): string {
    const auth = this.deviceSecret(deviceId)
    const tag = auth ? revokedTag(auth, this.agentId(), deviceId).toString('base64') : ''

    this.memorySecrets.delete(deviceId)
    this.state = withRevoked(this.state, deviceId, tag)
    this.saveSoon(0)

    return tag
  }

  /** Тег отпущенного телефона; null - не отпускали или тега нет (ключ не открылся). */
  revokedTag(deviceId: string): string | null {
    return this.state.revoked.find((entry) => entry.id === deviceId)?.tag || null
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

  /**
   * Ключи IDE создаются раз и живут, пока человек не сменит. Не открылся хоть один (хранилище
   * сменилось, профиль перенесли на другой Mac) - новые оба, и с ними новый адрес на релее:
   * иначе копия профиля на втором Mac звонила бы с тем же адресом, и две IDE вытесняли бы друг
   * друга. Все телефоны спариваются заново.
   */
  private loadKeys(): Keys {
    if (this.keys) return this.keys

    const identity = opened(this.state.identity, this.vault)
    const signing = opened(this.state.signing, this.vault)

    if (identity && signing) {
      this.keys = keysOf(identity, signing)

      return this.keys
    }

    if (this.state.identity || this.state.signing) {
      console.warn('[remote] ключи IDE не открылись - новые ключи и адрес')
    }

    const fresh = keysOf(generateKeyPair(), generateKeyPair())
    const kept = this.vault.available()

    this.keys = fresh
    // Телефоны прежних ключей с новыми не поговорят: их пары - в отпущенные, без тега.
    this.state = this.state.devices.reduce(
      (state, device) => withRevoked(state, device.id, ''),
      this.state,
    )
    this.memorySecrets.clear()
    this.update({
      identity: kept ? this.vault.seal(exportPrivate(fresh.identity.privateKey)) : '',
      signing: kept ? this.vault.seal(exportPrivate(fresh.signing.privateKey)) : '',
    })

    return fresh
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

const opened = (sealed: string, vault: Vault): KeyPair | null => {
  const der = sealed && vault.available() ? vault.open(sealed) : null

  return der ? tryRestore(der) : null
}

const tryRestore = (der: Buffer): KeyPair | null => {
  try {
    return restoreKeyPair(der)
  } catch {
    return null
  }
}

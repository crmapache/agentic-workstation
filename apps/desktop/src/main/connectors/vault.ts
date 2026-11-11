import { mkdir, rename, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Шифр хранилища. В IDE - safeStorage Electron (ключ в Keychain самой IDE), в тестах -
 * подставной: так хранилище проверяется без Electron.
 */
export type VaultCipher = {
  available: () => boolean
  encrypt: (text: string) => Buffer
  decrypt: (data: Buffer) => string
}

/**
 * Секреты коннекторов: токены входа, ключи клиентов OAuth и MCP. Одним зашифрованным
 * файлом в userData (права 600), в памяти - расшифрованная копия. Шифрования нет (Linux
 * без связки ключей, сломанный Keychain) - хранилище ничего не пишет и говорит об этом:
 * секрет открытым текстом на диск не ложится никогда.
 */
export class Vault {
  private writing: Promise<void> = Promise.resolve()

  private constructor(
    private readonly path: string,
    private readonly cipher: VaultCipher,
    private readonly entries: Map<string, string>,
    /** Прежний файл не расшифровался и отложен рядом: входы надо сделать заново. */
    readonly wasReset: boolean,
    /** Нечитаемый файл не удалось отложить: запись затёрла бы его, поэтому её нет. */
    private readonly blocked = false,
  ) {}

  /**
   * Файл есть, но не расшифровался (ключ в Keychain сменился, userData перенесли) - он
   * откладывается рядом с меткой времени, а не затирается первой же записью: ключ может
   * вернуться, и тогда входы восстановимы.
   */
  static async load(path: string, cipher: VaultCipher): Promise<Vault> {
    const read = await readEntries(path, cipher)

    if (read === 'unreadable') {
      // Отложить не вышло - писать нельзя: первая же запись затёрла бы старые входы.
      const movedAside = await rename(path, `${path}.unreadable-${Date.now()}`).then(
        () => true,
        (error: unknown) => {
          console.warn('[connectors] нечитаемое хранилище не отложено', error)

          return false
        },
      )

      return new Vault(path, cipher, new Map(), true, !movedAside)
    }

    return new Vault(path, cipher, read, false)
  }

  get available(): boolean {
    return !this.blocked && this.cipher.available()
  }

  get(key: string): string | null {
    return this.entries.get(key) ?? null
  }

  /** Записать или удалить (null). Записи идут по очереди: последняя не обгонит раннюю. */
  set(key: string, value: string | null): Promise<void> {
    if (!this.available) return Promise.reject(new Error('Шифрование хранилища недоступно'))

    if (value === null) this.entries.delete(key)
    else this.entries.set(key, value)

    const snapshot = JSON.stringify(Object.fromEntries(this.entries))

    this.writing = this.writing.catch(() => undefined).then(() => this.persist(snapshot))

    return this.writing
  }

  /** Удалить все ключи с этим началом: секреты удалённого коннектора. */
  async forgetPrefix(prefix: string): Promise<void> {
    const keys = [...this.entries.keys()].filter((key) => key.startsWith(prefix))

    for (const key of keys) await this.set(key, null)
  }

  private async persist(snapshot: string): Promise<void> {
    const temporary = `${this.path}.tmp`

    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(temporary, this.cipher.encrypt(snapshot), { mode: 0o600 })
    await rename(temporary, this.path)
  }
}

/** Содержимое файла; нет файла или нет шифрования - пусто, не расшифровался - 'unreadable'. */
const readEntries = async (
  path: string,
  cipher: VaultCipher,
): Promise<Map<string, string> | 'unreadable'> => {
  if (!cipher.available()) return new Map()

  let data: Buffer

  try {
    data = await readFile(path)
  } catch {
    return new Map()
  }

  try {
    const parsed = JSON.parse(cipher.decrypt(data)) as unknown

    if (typeof parsed !== 'object' || parsed === null) return 'unreadable'

    return new Map(
      Object.entries(parsed).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string'
      }),
    )
  } catch (error) {
    console.warn('[connectors] хранилище секретов не расшифровалось', error)

    return 'unreadable'
  }
}

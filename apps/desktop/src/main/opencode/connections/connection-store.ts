import { randomBytes } from 'node:crypto'

import type { ModelConnectionKind } from '@shared/open-models'

import type { JsonFile } from '../../storage/json-file'
import type { Vault } from '../../storage/vault'
import { KIND_LABELS, DEFAULT_BASE_URLS } from './connections.constants'

/** Подключение на диске: ключ - не здесь, а в хранилище секретов. */
export type StoredConnection = {
  id: string
  kind: ModelConnectionKind
  label: string
  baseUrl: string
}

export type StoredConnections = { connections: StoredConnection[] }

/** Новое подключение или правка: ключ null - убрать, нет - не трогать. */
export type ConnectionInput = {
  kind?: ModelConnectionKind
  label?: string
  baseUrl?: string
  key?: string | null
}

const KINDS: readonly ModelConnectionKind[] = ['ollama', 'lmstudio', 'openrouter', 'custom']

/** Локальные серверы на своих портах: есть всегда, найдены сами, на диске их нет. */
const DETECTED: readonly StoredConnection[] = [
  { id: 'ollama', kind: 'ollama', label: KIND_LABELS.ollama, baseUrl: DEFAULT_BASE_URLS.ollama },
  {
    id: 'lmstudio',
    kind: 'lmstudio',
    label: KIND_LABELS.lmstudio,
    baseUrl: DEFAULT_BASE_URLS.lmstudio,
  },
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

/** С диска - только узнаваемое: id из шестнадцатеричных цифр, известный вид, адрес http(s). */
const parseStored = (value: unknown): StoredConnection[] =>
  (isRecord(value) && Array.isArray(value['connections']) ? value['connections'] : [])
    .filter(isRecord)
    .map((row) => ({
      id: text(row, 'id'),
      kind: KINDS.find((kind) => kind === row['kind']) ?? 'custom',
      label: text(row, 'label'),
      baseUrl: text(row, 'baseUrl'),
    }))
    .filter((row) => /^[0-9a-f]{12}$/.test(row.id) && /^https?:\/\//.test(row.baseUrl))

const vaultKey = (id: string) => `open-models:${id}`

/** Хост адреса (схема, имя, порт); не адрес - он сам: сравнение тогда строгое. */
const originOf = (url: string): string => {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

/**
 * Подключения панели открытых моделей (docs/plan-providers/40-open-models.md): найденные
 * локальные серверы (Ollama, LM Studio) и добавленные человеком (OpenRouter, свой адрес, другой
 * Ollama). Список - в JSON, ключи - в хранилище секретов IDE; ключ окну не уходит никогда.
 */
export class ConnectionStore {
  private constructor(
    private rows: StoredConnection[],
    private readonly file: JsonFile<StoredConnections>,
    private readonly vault: Vault,
  ) {}

  static async load(file: JsonFile<StoredConnections>, vault: Vault): Promise<ConnectionStore> {
    return new ConnectionStore(parseStored(await file.read()), file, vault)
  }

  /** Все подключения: найденные - первыми. */
  get list(): readonly StoredConnection[] {
    return [...DETECTED, ...this.rows]
  }

  isDetected(id: string): boolean {
    return DETECTED.some((row) => row.id === id)
  }

  find(id: string): StoredConnection | undefined {
    return this.list.find((row) => row.id === id)
  }

  keyOf(id: string): string {
    return this.vault.get(vaultKey(id)) ?? ''
  }

  hasKey(id: string): boolean {
    return this.keyOf(id) !== ''
  }

  /** Можно ли хранить ключи: без шифрования ключ не ложится на диск открытым текстом. */
  get canStoreKeys(): boolean {
    return this.vault.available
  }

  /** Новое подключение: ключ - сначала (хранилище отказало - подключения нет), потом строка. */
  async add(input: ConnectionInput): Promise<string> {
    const kind = input.kind ?? 'custom'
    const id = randomBytes(6).toString('hex')
    // У OpenRouter адрес свой и не меняется: ключ от него не уйдёт на чужой хост.
    const baseUrl =
      kind === 'openrouter'
        ? DEFAULT_BASE_URLS.openrouter
        : input.baseUrl?.trim() || (kind === 'custom' ? '' : DEFAULT_BASE_URLS[kind])

    if (input.key) await this.vault.set(vaultKey(id), input.key)

    this.rows = [
      ...this.rows,
      { id, kind, label: input.label?.trim() || KIND_LABELS[kind] || baseUrl, baseUrl },
    ]
    this.save()

    return id
  }

  /**
   * Правка добавленного подключения; у найденного - только ключ: имя и адрес у него свои. Адрес
   * сменил хост, а нового ключа нет - сохранённый стирается: ключ от одного сервера другому не
   * отдаётся. Ключ - сначала, строка - после: отказ хранилища ничего не меняет.
   */
  async update(id: string, input: ConnectionInput): Promise<void> {
    const row = this.find(id)

    if (!row) return

    const baseUrl =
      row.kind === 'openrouter' || this.isDetected(id)
        ? row.baseUrl
        : input.baseUrl?.trim() || row.baseUrl
    const movedHost = originOf(baseUrl) !== originOf(row.baseUrl)
    const key = input.key !== undefined ? input.key || null : movedHost ? null : undefined

    if (key !== undefined && (key !== null || this.hasKey(id))) {
      await this.vault.set(vaultKey(id), key)
    }

    this.rows = this.rows.map((item) =>
      item.id === id
        ? {
            ...item,
            ...(input.label !== undefined && { label: input.label.trim() || item.label }),
            baseUrl,
          }
        : item,
    )
    this.save()
  }

  /** Убрать добавленное вместе с ключом; найденное убрать нельзя. */
  async remove(id: string): Promise<void> {
    if (this.isDetected(id)) return
    if (this.hasKey(id)) await this.vault.set(vaultKey(id), null)

    this.rows = this.rows.filter((row) => row.id !== id)
    this.save()
  }

  private save(): void {
    void this.file.write({ connections: this.rows }).catch((error: unknown) => {
      console.warn('[opencode] подключения не записались:', error)
    })
  }
}

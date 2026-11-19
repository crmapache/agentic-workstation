import type { ExtensionGrant } from '@shared/extensions'
import { EXTENSION_PERMISSIONS } from '@shared/extensions'

import type { JsonFile } from '../storage/json-file'

/** Откуда расширение: своя папка или магазин (какой версии и чьё). */
export type ExtensionSource = { kind: 'store'; version: string; publisher: string } | null

/** Что IDE помнит о расширении сверх его папки. */
export type StoredExtension = {
  enabled: boolean
  /** Что выдал человек; null - ещё ничего. */
  granted: ExtensionGrant | null
  /** Значения настроек без секретов: секреты - в хранилище ключей. */
  settings: Record<string, string | boolean>
  source: ExtensionSource
}

export type StoredExtensions = { version: 1; extensions: Record<string, StoredExtension> }

const FRESH: StoredExtension = { enabled: true, granted: null, settings: {}, source: null }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const grantOf = (value: unknown): ExtensionGrant | null => {
  if (!isRecord(value)) return null

  return {
    permissions: strings(value['permissions']).filter(
      (item): item is ExtensionGrant['permissions'][number] =>
        (EXTENSION_PERMISSIONS as readonly string[]).includes(item),
    ),
    hosts: strings(value['hosts']),
    commands: strings(value['commands']),
  }
}

const settingsOf = (value: unknown): Record<string, string | boolean> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string | boolean] =>
            typeof entry[1] === 'string' || typeof entry[1] === 'boolean',
        ),
      )
    : {}

const sourceOf = (value: unknown): ExtensionSource =>
  isRecord(value) &&
  value['kind'] === 'store' &&
  typeof value['version'] === 'string' &&
  typeof value['publisher'] === 'string'
    ? { kind: 'store', version: value['version'], publisher: value['publisher'] }
    : null

/** Разбор файла с диска: битое и незнакомое отбрасывается, а не роняет IDE. */
export const parseStored = (raw: unknown): StoredExtensions => {
  const extensions = isRecord(raw) && isRecord(raw['extensions']) ? raw['extensions'] : {}

  return {
    version: 1,
    extensions: Object.fromEntries(
      Object.entries(extensions)
        .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
        .map(([id, item]) => [
          id,
          {
            enabled: item['enabled'] !== false,
            granted: grantOf(item['granted']),
            settings: settingsOf(item['settings']),
            source: sourceOf(item['source']),
          },
        ]),
    ),
  }
}

/** Записи расширений в userData (`extensions.json`): включено, выданные права, настройки. */
export class ExtensionsStore {
  private writing: Promise<void> = Promise.resolve()

  private constructor(
    private state: StoredExtensions,
    private readonly file: JsonFile<StoredExtensions>,
  ) {}

  static async load(file: JsonFile<StoredExtensions>): Promise<ExtensionsStore> {
    return new ExtensionsStore(parseStored(await file.read()), file)
  }

  get(id: string): StoredExtension {
    return this.state.extensions[id] ?? FRESH
  }

  update(id: string, patch: Partial<StoredExtension>): StoredExtension {
    const next = { ...this.get(id), ...patch }

    this.state = { ...this.state, extensions: { ...this.state.extensions, [id]: next } }
    this.persist()

    return next
  }

  forget(id: string): void {
    const { [id]: _gone, ...rest } = this.state.extensions

    this.state = { ...this.state, extensions: rest }
    this.persist()
  }

  /** Записи идут по очереди: последняя на диске - последнее состояние. */
  settled(): Promise<void> {
    return this.writing
  }

  private persist() {
    const snapshot = this.state

    this.writing = this.writing
      .then(() => this.file.write(snapshot))
      .catch((error: unknown) => console.warn('[extensions] extensions.json не записан', error))
  }
}

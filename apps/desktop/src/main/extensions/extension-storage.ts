import { rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { JsonFile } from '../storage/json-file'

/** Потолок хранилища одного расширения - в знаках JSON. */
export const STORAGE_MAX_CHARS = 1024 * 1024

/**
 * Своё хранилище расширения (`ide.storage`): ключ - значение JSON, файл на расширение в
 * `extensions-data/`. Читается на первом вопросе, пишется по очереди.
 */
export class ExtensionStorage {
  private readonly values = new Map<string, Record<string, unknown>>()
  private readonly writing = new Map<string, Promise<void>>()

  constructor(private readonly dir: string) {}

  async get(id: string, key: string): Promise<unknown> {
    return (await this.load(id))[key] ?? null
  }

  async keys(id: string): Promise<string[]> {
    return Object.keys(await this.load(id))
  }

  async set(id: string, key: string, value: unknown): Promise<void> {
    const next = { ...(await this.load(id)), [key]: value }

    if (JSON.stringify(next).length > STORAGE_MAX_CHARS) {
      throw new Error('Extension storage is full: it keeps up to 1 MB of JSON.')
    }

    this.values.set(id, next)
    this.persist(id, next)
  }

  async delete(id: string, key: string): Promise<void> {
    const { [key]: _gone, ...rest } = await this.load(id)

    this.values.set(id, rest)
    this.persist(id, rest)
  }

  /** Записи всех расширений дописаны: выход из IDE не обрывает последнюю. */
  async settled(): Promise<void> {
    await Promise.all(this.writing.values())
  }

  /** Расширение удалено: его данные - тоже. */
  async forget(id: string): Promise<void> {
    await this.writing.get(id)
    this.values.delete(id)
    await rm(this.path(id), { force: true })
  }

  private async load(id: string): Promise<Record<string, unknown>> {
    const known = this.values.get(id)

    if (known) return known

    const raw = await readFile(this.path(id), 'utf8').catch(() => '{}')
    let parsed: unknown

    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = {}
    }

    const value =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}

    this.values.set(id, value)

    return value
  }

  private persist(id: string, value: Record<string, unknown>) {
    const file = new JsonFile<Record<string, unknown>>(this.path(id), { mode: 0o600 })
    const previous = this.writing.get(id) ?? Promise.resolve()

    this.writing.set(
      id,
      previous
        .then(() => file.write(value))
        .catch((error: unknown) => console.warn('[extensions] хранилище не записано', id, error)),
    )
  }

  private path(id: string) {
    return join(this.dir, `${id}.json`)
  }
}

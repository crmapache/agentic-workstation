import type { ModelConnection } from '@shared/open-models'

import type { ProbeResult } from './connection-probe'
import { probeConnection } from './connection-probe'
import type { ConnectionInput, ConnectionStore } from './connection-store'

/** Подключение без ответа пробы: проба идёт или ещё не начиналась. */
const CHECKING: ProbeResult = { state: 'checking', error: '', models: [], credits: null }

/**
 * Подключения с их живым состоянием: что лежит в хранилище и что ответила последняя проба.
 * Проба всех идёт разом и не повторяется, пока идёт; правка подключения пробует его заново.
 * changed - состояние поменялось (окну и конфигу процессов).
 */
export class ModelConnections {
  private readonly results = new Map<string, ProbeResult>()
  private probing: Promise<void> | null = null

  constructor(
    readonly store: ConnectionStore,
    private readonly changed: () => void,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** Подключения в форме окна: ключ - только есть ли он. */
  get list(): ModelConnection[] {
    return this.store.list.map((row) => {
      const result = this.results.get(row.id) ?? CHECKING

      return {
        ...row,
        hasKey: this.store.hasKey(row.id),
        detected: this.store.isDetected(row.id),
        state: result.state,
        error: result.error,
        models: result.models,
        credits: result.credits,
      }
    })
  }

  keyOf(id: string): string {
    return this.store.keyOf(id)
  }

  /** Пробовать все подключения заново; проба, которая уже идёт, не повторяется. */
  refresh(): Promise<void> {
    this.probing ??= Promise.all(this.store.list.map((row) => this.probe(row.id))).then(
      () => {
        this.probing = null
      },
      () => {
        this.probing = null
      },
    )

    return this.probing
  }

  async add(input: ConnectionInput): Promise<string> {
    const id = await this.store.add(input)

    this.changed()
    await this.probe(id)

    return id
  }

  async update(id: string, input: ConnectionInput): Promise<void> {
    await this.store.update(id, input)
    this.results.delete(id)
    this.changed()
    await this.probe(id)
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(id)
    if (!this.store.find(id)) this.results.delete(id)
    this.changed()
  }

  private async probe(id: string): Promise<void> {
    const row = this.store.find(id)

    if (!row) return

    const result = await probeConnection(
      { kind: row.kind, baseUrl: row.baseUrl, key: this.store.keyOf(id) },
      this.fetcher,
    )

    // Подключение убрали, пока шла проба, - ответ уже ничей.
    if (!this.store.find(id)) return

    this.results.set(id, result)
    this.changed()
  }
}

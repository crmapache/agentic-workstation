import type { ModelConnection } from '@shared/open-models'

import type { ProbeResult } from './connection-probe'
import { loadOllamaModel, probeConnection } from './connection-probe'
import type { ConnectionInput, ConnectionStore } from './connection-store'

/** Подключение без ответа пробы: проба идёт или ещё не начиналась. */
const CHECKING: ProbeResult = {
  state: 'checking',
  error: '',
  models: [],
  credits: null,
  serverWindow: null,
  unsure: [],
}

/**
 * Подключения с их живым состоянием: что лежит в хранилище и что ответила последняя проба.
 * Проба всех идёт разом и не повторяется, пока идёт; правка подключения пробует его заново.
 * Пробы одного подключения идут друг за другом: каждая знает окно сервера Ollama, которое
 * узнала прошлая, и опоздавшая не затрёт свежую. changed - состояние поменялось (окну и
 * конфигу процессов).
 */
export class ModelConnections {
  private readonly results = new Map<string, ProbeResult>()
  private readonly lines = new Map<string, Promise<void>>()
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

  /**
   * Перед запуском процесса OpenCode на модели Ollama: окно в его конфиге должно быть тем, с
   * которым сервер её держит (ollama-window.ts). Окно - догадка (сервер ещё ни одной модели не
   * загружал) - модель загружается, и сервер его называет. Загрузка та же, что сделал бы первый
   * запрос; не удалась - процесс идёт с тем, что знали.
   */
  async prepare(connectionId: string, modelId: string): Promise<void> {
    const row = this.store.find(connectionId)

    if (row?.kind !== 'ollama') return

    await this.probe(connectionId)

    const result = this.results.get(connectionId)

    // Сервер не отвечает - грузить не у кого; окно модели известно - грузить незачем.
    if (result?.state !== 'ok') return
    if (result.models.some((model) => model.id === modelId) && !result.unsure.includes(modelId)) {
      return
    }

    await loadOllamaModel(row.baseUrl, modelId, this.fetcher).catch((error: unknown) => {
      console.warn('[open-models] модель Ollama не загрузилась, окно - прежнее:', error)
    })
    await this.probe(connectionId)
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(id)
    if (!this.store.find(id)) {
      this.results.delete(id)
      this.lines.delete(id)
    }
    this.changed()
  }

  private probe(id: string): Promise<void> {
    const next = (this.lines.get(id) ?? Promise.resolve()).then(() => this.probeNow(id))

    this.lines.set(
      id,
      next.catch(() => undefined),
    )

    return next
  }

  private async probeNow(id: string): Promise<void> {
    const row = this.store.find(id)

    if (!row) return

    const result = await probeConnection(
      { kind: row.kind, baseUrl: row.baseUrl, key: this.store.keyOf(id) },
      this.fetcher,
      this.results.get(id)?.serverWindow ?? null,
    )

    // Подключение убрали, пока шла проба, - ответ уже ничей.
    if (!this.store.find(id)) return

    this.results.set(id, result)
    this.changed()
  }
}

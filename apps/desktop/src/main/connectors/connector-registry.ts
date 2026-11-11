import type { JsonFile } from '../storage/json-file'
import type { StoredTool, StoredType, StoredConnector, StoredConnectors } from './connector-store'

/**
 * Реестр коннекторов: список, поиск и запись на диск. Каждое изменение - новый объект и
 * запись в очередь (JsonFile пишет атомарно): реестр маленький, а потерять подключённую
 * почту из-за сбоя посреди записи нельзя.
 */
export class ConnectorRegistry {
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private stored: StoredConnectors,
    private readonly file: JsonFile<StoredConnectors>,
  ) {}

  get connectors(): readonly StoredConnector[] {
    return this.stored.connectors
  }

  get types(): readonly StoredType[] {
    return this.stored.types
  }

  findType(id: string | null): StoredType | null {
    return this.stored.types.find((type) => type.id === id) ?? null
  }

  /** Подключения своего типа. */
  connectionsOf(typeId: string): StoredConnector[] {
    return this.stored.connectors.filter((connector) => connector.typeId === typeId)
  }

  /** Начала имён серверов своих типов: два типа с одним началом дали бы одно имя сервера. */
  serverBases(): Set<string> {
    return new Set(this.stored.types.map((type) => type.serverBase))
  }

  get googleClientId(): string | null {
    return this.stored.googleClientId
  }

  find(id: string): StoredConnector | null {
    return this.stored.connectors.find((connector) => connector.id === id) ?? null
  }

  byServer(serverName: string): StoredConnector | null {
    return this.stored.connectors.find((connector) => connector.serverName === serverName) ?? null
  }

  serverNames(): Set<string> {
    return new Set(this.stored.connectors.map((connector) => connector.serverName))
  }

  /** Коннектор и, если он первый у нового своего типа, - сам тип, одной записью. */
  add(connector: StoredConnector, type: StoredType | null = null): Promise<void> {
    return this.save({
      ...this.stored,
      connectors: [...this.stored.connectors, connector],
      types: type ? [...this.stored.types, type] : this.stored.types,
    })
  }

  updateType(id: string, patch: Partial<Pick<StoredType, 'name' | 'multiple'>>): Promise<void> {
    return this.save({
      ...this.stored,
      types: this.stored.types.map((type) => (type.id === id ? { ...type, ...patch } : type)),
    })
  }

  removeType(id: string): Promise<void> {
    return this.save({ ...this.stored, types: this.stored.types.filter((type) => type.id !== id) })
  }

  /**
   * Перенос (connector-migrate.ts): новые и убранные типы и правки коннекторов одной записью
   * - реестр не должен остаться на диске наполовину перенесённым.
   */
  reshape({
    types = [],
    dropTypes = new Set(),
    patches,
  }: {
    types?: StoredType[]
    dropTypes?: ReadonlySet<string>
    patches: ReadonlyMap<string, Partial<StoredConnector>>
  }): Promise<void> {
    return this.save({
      ...this.stored,
      types: [...this.stored.types.filter((type) => !dropTypes.has(type.id)), ...types],
      connectors: this.stored.connectors.map((connector) => {
        const patch = patches.get(connector.id)

        return patch ? { ...connector, ...patch } : connector
      }),
    })
  }

  remove(id: string): Promise<void> {
    return this.save({
      ...this.stored,
      connectors: this.stored.connectors.filter((connector) => connector.id !== id),
    })
  }

  update(id: string, patch: Partial<StoredConnector>): Promise<void> {
    return this.save({
      ...this.stored,
      connectors: this.stored.connectors.map((connector) =>
        connector.id === id ? { ...connector, ...patch } : connector,
      ),
    })
  }

  /** Инструменты, как их отдал сервис: на диск - только если список поменялся. */
  async rememberTools(id: string, tools: StoredTool[]): Promise<void> {
    if (JSON.stringify(this.find(id)?.tools) === JSON.stringify(tools)) return

    await this.update(id, { tools })
  }

  setGoogleClientId(googleClientId: string | null): Promise<void> {
    return this.save({ ...this.stored, googleClientId })
  }

  /**
   * Записи - по очереди и всегда последним снимком: у JsonFile одна временная копия на файл,
   * две записи разом портят её (на старте инструменты всех коннекторов приходят сразу).
   */
  private save(next: StoredConnectors): Promise<void> {
    this.stored = next
    this.writing = this.writing.catch(() => undefined).then(() => this.file.write(this.stored))

    return this.writing
  }
}

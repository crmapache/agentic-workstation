import type { ConnectorAccess } from './connector-access'
import { LiveConnector } from './connector-live'
import type { ConnectorRegistry } from './connector-registry'
import { SecretsOf } from './connector-secrets'
import type { StoredConnector } from './connector-store'
import type { ConnectorsPlaces } from './connectors-service.types'
import type { Launch } from './gateway/launches'
import { browserAccount } from './kinds/browser/browser-desk'

/**
 * Живые коннекторы по id: собрать из реестра, отдать шлюзу, отпустить процессы команд
 * кончившегося разговора, погасить всё на выходе.
 */
export class LiveConnectors {
  private readonly live = new Map<string, LiveConnector>()

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly places: ConnectorsPlaces,
    private readonly access: () => ConnectorAccess,
    private readonly changed: () => void,
  ) {}

  get(id: string): LiveConnector | null {
    return this.live.get(id) ?? null
  }

  all(): LiveConnector[] {
    return [...this.live.values()]
  }

  attach(connector: StoredConnector): LiveConnector {
    const live = new LiveConnector(
      connector,
      new SecretsOf(this.places.vault, connector.id),
      {
        googleClient: () => this.access().googleClient(),
        shellEnv: this.places.shellEnv,
        version: this.places.version,
        browser: this.places.browser.hub,
      },
      {
        stored: () => this.registry.find(connector.id),
        typeName: () =>
          this.registry.findType(this.registry.find(connector.id)?.typeId ?? null)?.name ?? null,
        signingIn: () => this.access().isSigningIn(connector.id),
        toolsListed: (tools) => {
          this.registry.rememberTools(connector.id, tools).catch((error: unknown) => {
            console.warn('[connectors] инструменты не записаны', connector.serverName, error)
          })
        },
        changed: this.changed,
        ...(connector.kind === 'browser'
          ? { account: () => browserAccount(this.places.browser.state()) }
          : {}),
      },
    )

    this.live.set(connector.id, live)

    return live
  }

  /** Забыть коннектор и погасить его источники: шлюз его уже не найдёт. */
  async detach(id: string): Promise<void> {
    const live = this.live.get(id)

    this.live.delete(id)
    await live?.dispose()
  }

  /** Процесс разговора кончился: его процессы команд у всех коннекторов - погасить. */
  release(launch: Launch): void {
    for (const live of this.live.values()) live.release(launch)
  }

  /** Разговор закрыт: то, что коннекторы держали на него (вкладки браузера), - отпустить. */
  endConversation(conversationId: string): void {
    for (const live of this.live.values()) live.endConversation(conversationId)
  }

  async disposeAll(): Promise<void> {
    await Promise.allSettled(this.all().map((live) => live.dispose()))
  }
}

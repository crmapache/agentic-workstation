import { isAvailableIn } from '@shared/connector-availability'

import type { LiveConnector } from './connector-live'
import type { ConnectorRegistry } from './connector-registry'
import { ConnectorGateway } from './gateway/gateway'
import { GatewayLaunches } from './gateway/launches'
import type { Launch, McpLaunch } from './gateway/launches'

/**
 * Шлюз коннекторов и конфиги `--mcp-config` по процессам разговоров (ADR 0029). Процесс
 * получает только коннекторы своего проекта, а шлюз по ключу процесса не пускает к
 * выключенному там коннектору - даже процесс, поднятый до выключения.
 */
export class GatewayHost {
  private readonly gateway: ConnectorGateway<Launch>
  private readonly launches: GatewayLaunches

  constructor(
    private readonly registry: ConnectorRegistry,
    live: (id: string) => LiveConnector | null,
    configDir: string,
    version: string,
    released: (launchId: string) => void,
  ) {
    this.launches = new GatewayLaunches(configDir, released)
    this.gateway = new ConnectorGateway<Launch>(
      {
        authorize: (token) => this.launches.find(token),
        resolve: (name, launch) => {
          const connector = registry.byServer(name)

          if (!connector || !isAvailableIn(connector.availability, launch.projectPath)) {
            return null
          }

          return live(connector.id)?.gatewayServer(launch) ?? null
        },
      },
      version,
    )
  }

  async start(): Promise<void> {
    await this.launches.clear().catch((error: unknown) => {
      console.warn('[connectors] старые конфиги шлюза не стёрты', error)
    })
    await this.gateway.start()
  }

  stop(): Promise<void> {
    return this.gateway.stop()
  }

  /**
   * Конфиг для нового процесса разговора в этом проекте: коннекторы, видимые в нём, со
   * своим ключом. Шлюз не поднят или коннекторов в проекте нет - null, флага не нужно.
   * Файл не записался - ошибка: процесс поднимется без коннекторов и скажет об этом.
   */
  open(projectPath: string): Promise<McpLaunch | null> {
    const entries = this.registry.connectors.flatMap((connector) => {
      const url = this.gateway.urlOf(connector.serverName)

      return url && isAvailableIn(connector.availability, projectPath)
        ? [{ name: connector.serverName, url }]
        : []
    })

    return entries.length ? this.launches.issue(projectPath, entries) : Promise.resolve(null)
  }
}

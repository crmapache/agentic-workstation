import { isAvailableIn } from '@shared/connector-availability'
import { walkthroughMissing } from '@shared/walkthrough'

import type { LiveConnector } from './connector-live'
import type { ConnectorRegistry } from './connector-registry'
import { ConnectorGateway } from './gateway/gateway'
import type { GatewayServer } from './gateway/gateway'
import { grantedServer } from './gateway/granted'
import { GatewayLaunches } from './gateway/launches'
import type { Launch, McpLaunch, LaunchGrant, GatewayLaunch } from './gateway/launches'
import type { GatewayEntry } from './gateway/mcp-config'
import { WORKSTATION_READ_TOOLS } from './kinds/workstation/workstation-tools'

/**
 * Что шлюз сообщает живым коннекторам (LiveConnectors): процесс кончился, работа разговора
 * встала, разговор закрыт.
 */
export type LaunchEnds = {
  release: (launch: Launch) => void
  idle: (conversationId: string) => void
  endConversation: (conversationId: string) => void
}

/**
 * Шлюз коннекторов и конфиги `--mcp-config` по процессам разговоров (ADR 0029). Процесс
 * получает только коннекторы своего проекта, а шлюз по ключу процесса не пускает к
 * выключенному там коннектору - даже процесс, поднятый до выключения.
 */
/** Свой сервер IDE для процесса разговора; не его процесс - null (шлюз ответит 404). */
export type IdeServer = (launch: Launch) => GatewayServer | null

export class GatewayHost {
  private readonly gateway: ConnectorGateway<Launch>
  private readonly launches: GatewayLaunches
  /**
   * Свои серверы IDE, которых нет в реестре коннекторов (инструменты поручения, ADR 0080): процесс
   * получает их, только если попросил при подъёме, и шлюз всё равно спрашивает, его ли это процесс.
   */
  private readonly ide = new Map<string, IdeServer>()

  constructor(
    private readonly registry: ConnectorRegistry,
    live: (id: string) => LiveConnector | null,
    configDir: string,
    version: string,
    /** Кому сказать, что процесс разговора кончился и что кончился сам разговор. */
    ends: LaunchEnds,
  ) {
    this.launches = new GatewayLaunches(
      configDir,
      (launch) => ends.release(launch),
      (conversationId) => ends.idle(conversationId),
      (conversationId) => ends.endConversation(conversationId),
    )
    this.gateway = new ConnectorGateway<Launch>(
      {
        authorize: (token) => this.launches.find(token),
        resolve: (name, launch) => {
          const own = this.ide.get(name)

          if (own && !launch.grant) return own(launch)

          const connector = registry.byServer(name)
          // Процесс с допуском видит только выданное, мимо доступности по проектам.
          const granted = launch.grant?.tools.get(name)

          if (
            !connector ||
            (launch.grant ? !granted : !isAvailableIn(connector.availability, launch.projectPath))
          ) {
            return null
          }

          const server = live(connector.id)?.gatewayServer(launch) ?? null

          return server && granted ? grantedServer(server, granted) : server
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

  /** Завести свой сервер IDE под именем, которое реестр коннекторам не отдаёт. */
  serveIde(name: string, server: IdeServer): void {
    this.ide.set(name, server)
  }

  /**
   * Конфиг для нового процесса разговора в этом проекте: коннекторы, видимые в нём, и
   * попрошенные свои серверы IDE, со своим ключом. Шлюз не поднят или коннекторов в проекте
   * нет - null, флага не нужно. Файл не записался - ошибка: процесс поднимется без коннекторов
   * и скажет об этом.
   */
  open(projectPath: string, ideServers: readonly string[] = []): Promise<McpLaunch | null> {
    const plan = this.planFor(projectPath, ideServers)

    return plan
      ? this.launches.issue(projectPath, plan.entries, plan.allowed)
      : Promise.resolve(null)
  }

  /** То же без файла - процессу, который берёт серверы флагами, а ключ из окружения (Codex). */
  openInMemory(projectPath: string, ideServers: readonly string[] = []): GatewayLaunch | null {
    const plan = this.planFor(projectPath, ideServers)

    return plan && this.launches.issueInMemory(projectPath, plan.entries, plan.allowed)
  }

  /**
   * Процесс с допуском (ADR 0114): только выданные серверы и инструменты, все - без вопроса
   * человеку (их выбрал он сам, настраивая источник), ни уведомлений, ни самой IDE. Выключенный
   * коннектор не выдаётся. Нечего выдать - null.
   */
  openGranted(workDir: string, grant: LaunchGrant): Promise<McpLaunch | null> {
    const plan = this.grantedPlan(grant)

    return plan
      ? this.launches.issue(workDir, plan.entries, plan.allowed, grant)
      : Promise.resolve(null)
  }

  /** То же без файла - процессу, который берёт серверы флагами (Codex, ACP, OpenCode). */
  openGrantedInMemory(workDir: string, grant: LaunchGrant): GatewayLaunch | null {
    const plan = this.grantedPlan(grant)

    return plan && this.launches.issueInMemory(workDir, plan.entries, plan.allowed, grant)
  }

  private grantedPlan(grant: LaunchGrant): { entries: GatewayEntry[]; allowed: string[] } | null {
    const entries = this.registry.connectors.flatMap((connector) => {
      const url = this.gateway.urlOf(connector.serverName)

      return url && connector.enabled && grant.tools.has(connector.serverName)
        ? [{ name: connector.serverName, url }]
        : []
    })
    const allowed = entries.flatMap(({ name }) =>
      (grant.tools.get(name) ?? []).map((tool) => `mcp__${name}__${tool}`),
    )

    return entries.length ? { entries, allowed } : null
  }

  private planFor(
    projectPath: string,
    ideServers: readonly string[],
  ): { entries: GatewayEntry[]; allowed: string[] } | null {
    const own = ideServers.flatMap((name) => {
      const url = this.ide.has(name) ? this.gateway.urlOf(name) : null

      return url ? [{ name, url }] : []
    })
    const entries = this.registry.connectors.flatMap((connector) => {
      const url = this.gateway.urlOf(connector.serverName)
      // Показ без Computer Use и Browser в проекте нечем вести (ADR 0134): сервера нет вовсе.
      const isShown =
        connector.kind !== 'walkthrough' ||
        walkthroughMissing(this.registry.connectors, projectPath).length === 0

      return url && isShown && isAvailableIn(connector.availability, projectPath)
        ? [{ name: connector.serverName, url }]
        : []
    })

    // Уведомления самому человеку (ADR 0069) - без вопроса «разрешить?»: правило на весь сервер.
    // У самой IDE (ADR 0090) без вопроса - только чтение: запуск сценария или письмо соседнему
    // разговору человек разрешает сам, как любое действие.
    const allowed = this.registry.connectors
      .filter(
        (connector) =>
          connector.enabled && entries.some((entry) => entry.name === connector.serverName),
      )
      .flatMap((connector) => {
        // Показ (ADR 0134) рисует поверх экрана и ждёт человека в звонке, который тот начал сам.
        if (connector.kind === 'notifications' || connector.kind === 'walkthrough') {
          return [`mcp__${connector.serverName}`]
        }

        if (connector.kind !== 'workstation') return []

        return WORKSTATION_READ_TOOLS.map((tool) => `mcp__${connector.serverName}__${tool}`)
      })
    // Свои серверы IDE работают на сам разговор и разрешены без вопроса, как уведомления.
    const all = [...own, ...entries]

    return all.length
      ? { entries: all, allowed: [...allowed, ...own.map((entry) => `mcp__${entry.name}`)] }
      : null
  }
}

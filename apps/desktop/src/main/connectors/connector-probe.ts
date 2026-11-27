import { isAvailableIn } from '@shared/connector-availability'
import type { ConnectorKind } from '@shared/connectors'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { LiveConnector } from './connector-live'
import type { ConnectorRegistry } from './connector-registry'
import type { IdeServer, GatewayHost } from './gateway-host'
import type { OutboundGate } from './outbound-gate'
import { isToolEnabled } from './tool-access'

/** Ответ инструмента на чтение, вызванного самой IDE: текст или почему не вышло. */
export type ProbeResult = { text: string } | { error: string }

/**
 * Кого сторожить нельзя: Browser, Computer и Walkthrough действуют на экране человека, Playwright
 * поднимает браузер, уведомления - лента самого человека. Сторож дёргает инструмент раз в
 * несколько минут.
 */
const UNWATCHABLE: readonly ConnectorKind[] = [
  'browser',
  'computer',
  'walkthrough',
  'playwright',
  'notifications',
]

const textOf = (result: CallToolResult): string =>
  result.content.map((part) => (part.type === 'text' ? part.text : `[${part.type}]`)).join('\n')

/**
 * Вызов инструмента коннектора самой IDE, без модели (сторожа поручений, ADR 0080): только
 * видимый в проекте, включённый, на чтение и включённый человеком. Отказ - словами для модели:
 * она увидит его в ответе wait и поправит сторожа.
 */
export const probeTool = async (
  registry: ConnectorRegistry,
  live: (id: string) => LiveConnector | null,
  request: {
    projectPath: string
    server: string
    tool: string
    args: Record<string, unknown>
    signal: AbortSignal
  },
): Promise<ProbeResult> => {
  const { server, tool, projectPath } = request
  const connector = registry.byServer(server)

  if (!connector || !isAvailableIn(connector.availability, projectPath)) {
    return { error: `There is no connector ${server} in this project.` }
  }

  if (UNWATCHABLE.includes(connector.kind)) {
    return { error: `${server} cannot be watched: use look or until instead.` }
  }

  if (!connector.enabled) return { error: `The user turned ${server} off.` }

  const stored = connector.tools.find((one) => one.name === tool)

  if (!stored) return { error: `${server} has no tool ${tool}.` }

  if (stored.access !== 'read' || !isToolEnabled(stored.access, connector.toolOverrides[tool])) {
    return {
      error: `${server} ${tool} is not a read-only tool or is turned off: a watch only reads.`,
    }
  }

  const source = live(connector.id)

  if (!source) return { error: `${server} is not running.` }

  try {
    const result = await source.callDirect(tool, request.args, projectPath, request.signal)
    const text = textOf(result)

    return result.isError ? { error: text.slice(0, 500) || 'The tool failed.' } : { text }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message.slice(0, 500) : 'The service did not answer.',
    }
  }
}

/**
 * Инструменты чтения, видимые в проекте, - именами инструментов CLI (mcp__сервер__инструмент):
 * их и только их получает дешёвая проверка look.
 */
export const readToolsIn = (registry: ConnectorRegistry, projectPath: string): string[] =>
  registry.connectors
    .filter(
      (connector) =>
        connector.enabled &&
        !UNWATCHABLE.includes(connector.kind) &&
        isAvailableIn(connector.availability, projectPath),
    )
    .flatMap((connector) =>
      connector.tools
        .filter(
          (tool) =>
            tool.access === 'read' &&
            isToolEnabled(tool.access, connector.toolOverrides[tool.name]),
        )
        .map((tool) => `mcp__${connector.serverName}__${tool.name}`),
    )

/**
 * Коннекторы для поручений (ADR 0080): свой сервер IDE на шлюзе, вызов на чтение без модели
 * (сторож), инструменты чтения проекта (дешёвая проверка) и правило отправки людям, которое
 * ставят задания, когда поднимутся.
 */
export class GoalConnectors {
  gate: OutboundGate | null = null

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly live: (id: string) => LiveConnector | null,
    private readonly gateway: GatewayHost,
  ) {}

  /** Свой сервер IDE: шлюз отдаёт его только процессам, которые его попросили. */
  serveIde(name: string, server: IdeServer): void {
    this.gateway.serveIde(name, server)
  }

  probe(request: Parameters<typeof probeTool>[2]): Promise<ProbeResult> {
    return probeTool(this.registry, this.live, request)
  }

  readTools(projectPath: string): string[] {
    return readToolsIn(this.registry, projectPath)
  }
}

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { SourceTool, SourceLaunch, ConnectorSource } from '../../connector-source'
import type { WorkstationLink } from '../../../workstation/workstation-link'

/** Пояснение сервера для модели. */
export const EXTENSIONS_GUIDE =
  'These tools come from Agentic Workstation extensions the user installed or built. Each tool says which extension it is from.'

const failed = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
})

/**
 * Инструменты расширений IDE для ИИ (ADR 0091): список читается у сервиса на каждый вопрос, а
 * перемены доходят до живых разговоров через serverChanged. Вызов уходит в песочницу расширения.
 * Сервис расширений - порт той же связи, что у коннектора самой IDE (ADR 0090): он поднимается
 * позже шлюза, до того у коннектора просто нет инструментов.
 */
export class ExtensionsSource implements ConnectorSource {
  constructor(private readonly link: WorkstationLink) {}

  private get service() {
    return this.link.ports?.extensions() ?? null
  }

  listTools(): Promise<SourceTool[]> {
    return Promise.resolve(
      (this.service?.tools() ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as SourceTool['inputSchema'],
        annotations: { readOnlyHint: tool.readOnly },
        access: tool.readOnly ? ('read' as const) : ('write' as const),
      })),
    )
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    _signal?: AbortSignal,
    launch?: SourceLaunch,
  ): Promise<CallToolResult> {
    const { service } = this

    if (!service)
      return failed('Extensions are starting or the IDE is closing. Try again in a moment.')

    try {
      const text = await service.callTool(name, args, {
        projectPath: launch?.projectPath ?? '',
        conversationId: launch?.conversationId ?? null,
      })

      return { content: [{ type: 'text', text }] }
    } catch (error) {
      return failed(error instanceof Error ? error.message : String(error))
    }
  }

  dispose(): Promise<void> {
    return Promise.resolve()
  }
}

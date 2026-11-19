import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { WorkstationLink } from '../../workstation/workstation-link'
import { ToolOutput } from '../../connectors/kinds/native-tools'
import { WORKSTATION_TOOLS } from '../../connectors/kinds/workstation/workstation-tools'
import { HostArgError } from './host-args'
import type { HostContext } from './host-types'

const textOf = (result: CallToolResult): string =>
  result.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n')

/**
 * Вся IDE для расширения с правом ide.control (ADR 0091): те же инструменты, что у ИИ в
 * коннекторе workstation (ADR 0090), как у входа снаружи - по всем проектам. Расширение знает
 * их по именам и схемам из `ide.workstation.tools()`.
 */
export const workstationBridge = (link: WorkstationLink): HostContext['workstation'] => ({
  tools: () =>
    WORKSTATION_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      readOnly: tool.access === 'read',
      inputSchema: tool.inputSchema,
    })),
  call: async (name, args) => {
    const tool = WORKSTATION_TOOLS.find((item) => item.name === name)

    if (!tool) throw new HostArgError(`Unknown IDE tool "${name}": see ide.workstation.tools().`)

    const result = await tool.run(args, link.ready, { launch: null, signal: undefined })

    if (result instanceof ToolOutput) {
      if (result.result.isError) throw new HostArgError(textOf(result.result))

      return textOf(result.result)
    }

    return result ?? null
  },
})

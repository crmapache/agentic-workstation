import { toolError } from '../connector-source'
import type { GatewayServer } from './gateway'

/**
 * Сервер для процесса с допуском (ADR 0114): список и вызов - только выданные инструменты.
 * Держит шлюз, а не флаги CLI: провайдер, который не умеет белый список, всё равно не дотянется
 * до набора текста или скрипта на странице.
 */
export const grantedServer = (server: GatewayServer, tools: readonly string[]): GatewayServer => ({
  instructions: () => server.instructions(),
  tools: async () => (await server.tools()).filter((tool) => tools.includes(tool.name)),
  call: (name, args, signal) =>
    tools.includes(name)
      ? server.call(name, args, signal)
      : Promise.resolve(toolError(`"${name}" is not available in this run.`)),
})

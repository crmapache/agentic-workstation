import type { CommandArgs, CommandName } from '@agentic-workstation/remote-protocol/commands'

import type { RemoteClient } from '../remote/remote-client'
import { CommandError } from './command-error'

/**
 * Данные команды для запроса React Query: итог IDE или отказ ошибкой (CommandError) - экран
 * показывает его на месте и предлагает повторить.
 */
export const commandData = async <N extends CommandName>(
  client: RemoteClient,
  agentId: string,
  name: N,
  args: CommandArgs<N>,
): Promise<unknown> => {
  const outcome = await client.command(agentId, name, args)

  if (!outcome.ok) throw new CommandError(outcome)

  return outcome.data
}

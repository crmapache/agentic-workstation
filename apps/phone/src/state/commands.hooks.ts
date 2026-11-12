import { useTranslation } from 'react-i18next'

import type { QueryKey } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { CommandArgs, CommandName } from '@agentic-workstation/remote-protocol/commands'

import { useClient } from '../lib/client'
import { CommandError } from './command-error'
import { failureText } from './commands.utils'
import { useToastStore } from './toast.store'

/**
 * Как кнопка обходится с итогом команды. quiet - отказ экран покажет сам, на месте (долгая
 * команда со своей карточкой), а не уведомлением; invalidates - что перечитать после команды,
 * которую IDE не присылает зеркалом (полки сценариев): и после отказа - отказ вроде
 * scenarioGone значит, что на экране уже не то, что у IDE.
 */
export type CommandOptions = { quiet?: boolean; invalidates?: QueryKey }

/**
 * Команда IDE как мутация: кнопка знает, что идёт (isPending), отказ IDE - уведомлением её
 * словами. Состояние после команды обычно приходит само - зеркалом, перезапрашивать нечего.
 */
export const useCommand = <N extends CommandName>(
  agentId: string,
  name: N,
  options: CommandOptions = {},
) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const show = useToastStore((state) => state.show)
  const { quiet = false, invalidates } = options

  return useMutation({
    mutationFn: async (args: CommandArgs<N>): Promise<unknown> => {
      const outcome = await client.command(agentId, name, args)

      if (!outcome.ok) throw new CommandError(outcome)

      return outcome.data
    },
    onError: (error) => {
      if (!quiet) show(t('errors.title'), failureText(t, error))
    },
    onSettled: () => {
      if (invalidates) void queryClient.invalidateQueries({ queryKey: invalidates })
    },
  })
}

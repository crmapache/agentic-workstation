import { useTranslation } from 'react-i18next'

import { useMutation } from '@tanstack/react-query'

import type { CommandArgs, CommandName } from '@agentic-workstation/remote-protocol/commands'

import { useClient } from '../lib/client'
import { CommandError } from './command-error'
import { failureText } from './commands.utils'
import { useToastStore } from './toast.store'

/**
 * Команда IDE как мутация: кнопка знает, что идёт (isPending), отказ IDE - уведомлением её
 * словами. Состояние после команды приходит само - зеркалом, перезапрашивать нечего.
 */
export const useCommand = <N extends CommandName>(agentId: string, name: N) => {
  const client = useClient()
  const { t } = useTranslation()
  const show = useToastStore((state) => state.show)

  return useMutation({
    mutationFn: async (args: CommandArgs<N>): Promise<unknown> => {
      const outcome = await client.command(agentId, name, args)

      if (!outcome.ok) throw new CommandError(outcome)

      return outcome.data
    },
    onError: (error) => show(t('errors.title'), failureText(t, error)),
  })
}

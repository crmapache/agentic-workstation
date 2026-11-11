import { useTranslation } from 'react-i18next'

import { useMutation } from '@tanstack/react-query'

import { useClient } from '../lib/client'
import { loadEarlierPage } from '../remote/earlier-pages'
import { CommandError } from './command-error'
import { failureText } from './commands.utils'
import { useToastStore } from './toast.store'

/**
 * Страница ленты выше того, что у телефона: ядро просит её у IDE от самого раннего своего
 * элемента и ставит перед лентой (кэш получает новую ленту зеркалом). true - встала; false -
 * ленту за это время сменил снимок, и страница не к ней. Отказ - уведомлением.
 */
export const useLoadEarlier = (agentId: string, conversationId: string) => {
  const client = useClient()
  const { t } = useTranslation()
  const show = useToastStore((state) => state.show)

  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      const outcome = await loadEarlierPage(client, agentId, conversationId)

      if (!outcome.ok) throw new CommandError(outcome)

      return outcome.data === true
    },
    onError: (error) => show(t('errors.title'), failureText(t, error)),
  })
}

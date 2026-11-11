import { useTranslation } from 'react-i18next'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Switch } from '@agentic-workstation/ui/Switch'

import { fastStateKey } from '../ConversationSettings.utils'
import { useCommand } from '../../../../state/commands.hooks'

/**
 * Быстрый режим этого разговора - просьба CLI, настроек машины не пишет. Под переключателем -
 * что CLI сказал о нём в последний раз: включён, выключен, пауза после лимита.
 */
export const FastMode = ({
  agentId,
  conversation,
}: {
  agentId: string
  conversation: ConversationWire
}) => {
  const { t } = useTranslation()
  const setFast = useCommand(agentId, 'conversation.setFast')
  const stateKey = fastStateKey(conversation.fast)

  return (
    <Switch
      label={t('conversation.fast.label')}
      description={stateKey ? t(stateKey) : undefined}
      checked={conversation.fast?.asked ?? false}
      disabled={setFast.isPending}
      onChange={(fast) => setFast.mutate({ conversationId: conversation.id, fast })}
    />
  )
}

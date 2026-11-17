import { useTranslation } from 'react-i18next'

import { PERMISSION_MODES } from '@agentic-workstation/remote-protocol/commands'
import type {
  ProviderCaps,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'
import { Section } from '@agentic-workstation/ui/Section'

import { modeOptions } from '../../../../lib/options.utils'
import { useCommand } from '../../../../state/commands.hooks'
import { OptionList } from '../../../../shell/OptionList/OptionList'

/**
 * Режим разрешений разговора - те же режимы и слова, что в меню MODE окна IDE (ADR 0076): что
 * окно гасит этой вкладке, погашено и здесь. Режим меняется сразу, и посреди хода, как у окна.
 */
export const ModeChoice = ({
  agentId,
  conversation,
  provider,
}: {
  agentId: string
  conversation: ConversationWire
  provider: ProviderCaps
}) => {
  const { t } = useTranslation()
  const setMode = useCommand(agentId, 'conversation.setMode')
  const current = conversation.permissionMode

  const handleSelect = (value: string) => {
    const mode = PERMISSION_MODES.find((one) => one === value)

    if (mode && mode !== current) setMode.mutate({ conversationId: conversation.id, mode })
  }

  return (
    <Section size="sm" title={t('conversation.settings.mode')}>
      <OptionList
        label={t('conversation.settings.mode')}
        options={modeOptions(t, provider, conversation.unavailableModes, current)}
        isSelected={(value) => value === current}
        onSelect={handleSelect}
      />
    </Section>
  )
}

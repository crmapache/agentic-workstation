import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import type {
  ProviderCaps,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Section } from '@agentic-workstation/ui/Section'
import { TextField } from '@agentic-workstation/ui/TextField'

import { modelOptions, effortOptions } from '../../../lib/options.utils'
import { useCommand } from '../../../state/commands.hooks'
import { OptionList } from '../../../shell/OptionList/OptionList'
import styles from './ConversationSettings.module.scss'

type Effort = CommandArgs<'conversation.setEffort'>['effort']

/**
 * Настройки живого разговора: имя, модель и усилие провайдера. Режим разрешений с телефона не
 * меняется - bypass и auto выбирает только человек за столом.
 */
export const ConversationSettings = ({
  open,
  agentId,
  conversation,
  provider,
  onClose,
}: {
  open: boolean
  agentId: string
  conversation: ConversationWire
  provider: ProviderCaps
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const [title, setTitle] = useState(conversation.title)
  const rename = useCommand(agentId, 'conversation.rename')
  const setModel = useCommand(agentId, 'conversation.setModel')
  const setEffort = useCommand(agentId, 'conversation.setEffort')
  const conversationId = conversation.id

  const handleRename = () => {
    if (title.trim()) rename.mutate({ conversationId, title: title.trim() })
  }

  return (
    <Modal
      open={open}
      title={t('conversation.settings.title')}
      description={conversation.title}
      closeLabel={t('common.close')}
      closeSize="touch"
      onClose={onClose}>
      <div className={styles.settings}>
        <div className={styles.rename}>
          <TextField
            size="touch"
            label={t('conversation.settings.name')}
            value={title}
            maxLength={100}
            onChange={setTitle}
          />
          <Button
            size="touch"
            disabled={!title.trim() || title.trim() === conversation.title || rename.isPending}
            onClick={handleRename}>
            {t('conversation.settings.rename')}
          </Button>
        </div>
        <Section size="sm" title={t('conversation.settings.model')}>
          <OptionList
            label={t('conversation.settings.model')}
            options={modelOptions(t, provider)}
            isSelected={(value) => (conversation.model ?? '') === value}
            onSelect={(value) => setModel.mutate({ conversationId, model: value || null })}
          />
        </Section>
        <Section size="sm" title={t('conversation.settings.effort')}>
          <OptionList
            label={t('conversation.settings.effort')}
            options={effortOptions(t, provider)}
            isSelected={(value) => (conversation.effort ?? '') === value}
            onSelect={(value) =>
              setEffort.mutate({ conversationId, effort: (value || null) as Effort })
            }
          />
        </Section>
      </div>
    </Modal>
  )
}

import { useTranslation } from 'react-i18next'

import { MAX_ASIDE_CHARS } from '@agentic-workstation/remote-protocol/conversation-commands'
import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import { useAside } from './AsideSheet.hooks'
import styles from './AsideSheet.module.scss'
import { AsideEntryView } from './parts/AsideEntryView'

/**
 * Вопросы сбоку этого разговора с этого телефона: что спросили, думает ли модель, её ответы.
 * Поле вопроса - внизу, под пальцем; как это работает - за «?».
 */
export const AsideSheet = ({
  open,
  agentId,
  conversationId,
  onClose,
}: {
  open: boolean
  agentId: string
  conversationId: string
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const aside = useAside(agentId, conversationId)

  return (
    <Modal
      open={open}
      title={t('aside.title')}
      closeLabel={t('common.close')}
      closeSize="touch"
      headerActions={
        <HelpButton
          size="touch"
          label={t('common.help')}
          title={t('aside.help.title')}
          text={t('aside.help.text')}
          closeLabel={t('common.close')}
        />
      }
      onClose={onClose}>
      <div className={styles.sheet}>
        {aside.entries.length === 0 && <p className={styles.muted}>{t('aside.none')}</p>}
        {aside.entries.map((entry) => (
          <AsideEntryView
            key={entry.askId}
            entry={entry}
            cancelling={aside.isCancelling}
            onCancel={aside.handleCancel}
          />
        ))}
        <div className={styles.ask}>
          <TextArea
            label={t('aside.question')}
            placeholder={t('aside.placeholder')}
            value={aside.question}
            maxLength={MAX_ASIDE_CHARS}
            data-autofocus
            onChange={aside.setQuestion}
          />
          <Button
            size="touch"
            variant="primary"
            disabled={!aside.question.trim() || aside.isThinking}
            onClick={aside.handleAsk}>
            {t('aside.ask')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

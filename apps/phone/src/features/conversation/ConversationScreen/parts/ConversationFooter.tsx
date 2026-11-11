import { useTranslation } from 'react-i18next'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { useConversationScreen, useConversationCommands } from '../ConversationScreen.hooks'
import styles from '../ConversationScreen.module.scss'
import { PendingCard } from '../../PendingCard/PendingCard'
import { Composer } from '../../../../shell/Composer/Composer'
import { CarryOnRow } from './CarryOnRow'
import { QueuedMessages } from './QueuedMessages'
import { StopButton } from './StopButton'

/**
 * Низ разговора: решение хода (разрешение, вопрос, план), очередь сообщений в IDE, «продолжит
 * после лимита», поле и - пока ход идёт - Stop в ряду поля, как в IDE: под большим пальцем, а не
 * в углу шапки. Пока ход идёт, отправленное встаёт в очередь.
 */
export const ConversationFooter = ({
  conversation,
  draftKey,
  offset,
  screen,
  commands,
}: {
  conversation: ConversationWire | undefined
  draftKey: string
  /** Насколько часы IDE впереди часов телефона. */
  offset: number
  screen: ReturnType<typeof useConversationScreen>
  commands: ReturnType<typeof useConversationCommands>
}) => {
  const { t } = useTranslation()
  const busy = conversation?.status === 'running'

  return (
    <div className={styles.footer}>
      {conversation?.pending && (
        <PendingCard
          pending={conversation.pending}
          pendingCount={conversation.pendingCount}
          busy={screen.isDeciding || commands.isDismissing}
          onDecide={screen.handleDecide}
          onDismiss={commands.handleDismiss}
        />
      )}
      {conversation && <QueuedMessages conversation={conversation} commands={commands} />}
      {conversation?.carryOn && (
        <CarryOnRow
          carryOn={conversation.carryOn}
          offset={offset}
          busy={commands.isCancellingCarryOn}
          onCancel={commands.handleCancelCarryOn}
        />
      )}
      <Composer
        draftKey={draftKey}
        placeholder={busy ? t('conversation.placeholderQueued') : t('conversation.placeholder')}
        sendLabel={t('conversation.send')}
        disabled={!conversation}
        actions={
          conversation?.status === 'running' && (
            <StopButton
              forceable={!!conversation.stopRequestedAt}
              stopping={screen.isStopping}
              forceStopping={commands.isForceStopping}
              onStop={screen.handleStop}
              onForceStop={commands.handleForceStop}
            />
          )
        }
        onSend={screen.handleSend}
      />
    </div>
  )
}

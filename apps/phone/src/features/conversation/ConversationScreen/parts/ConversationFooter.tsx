import { useTranslation } from 'react-i18next'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'

import styles from '../ConversationScreen.module.scss'
import { PendingCard } from '../../PendingCard/PendingCard'
import type { Decision } from '../../PendingCard/PendingCard.types'
import type { PreparedImage } from '../../../../lib/images'
import { Composer } from '../../../../shell/Composer/Composer'

/** Низ разговора: вопрос хода, очередь сообщений в IDE, поле. */
export const ConversationFooter = ({
  conversation,
  draftKey,
  deciding,
  onDecide,
  onSend,
}: {
  conversation: ConversationWire | undefined
  draftKey: string
  deciding: boolean
  onDecide: (requestId: string, decision: Decision) => void
  onSend: (text: string, images: PreparedImage[]) => Promise<boolean>
}) => {
  const { t } = useTranslation()

  return (
    <div className={styles.footer}>
      {conversation?.pending && (
        <div className={styles.dock}>
          <PendingCard
            pending={conversation.pending}
            pendingCount={conversation.pendingCount}
            busy={deciding}
            onDecide={onDecide}
          />
        </div>
      )}
      {conversation && conversation.queue.length > 0 && (
        <ul className={styles.queue} aria-label={t('conversation.queued')}>
          {conversation.queue.map((queued) => (
            <li key={queued.id} className={styles.queued}>
              <span className={styles.queuedMark}>{t('conversation.queuedMark')}</span>
              <span className={styles.queuedText}>
                {queued.text || t('conversation.queuedPhotos', { count: queued.imageCount })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Composer
        draftKey={draftKey}
        placeholder={
          conversation?.status === 'running'
            ? t('conversation.placeholderQueued')
            : t('conversation.placeholder')
        }
        sendLabel={t('conversation.send')}
        disabled={!conversation}
        onSend={onSend}
      />
    </div>
  )
}

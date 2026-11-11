import { Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ConversationScreen.module.scss'
import { PendingCard } from '../../PendingCard/PendingCard'
import type { Decision } from '../../PendingCard/PendingCard.types'
import type { PreparedImage } from '../../../../lib/images'
import { Composer } from '../../../../shell/Composer/Composer'

/**
 * Низ разговора: решение хода (разрешение, вопрос, план), очередь сообщений в IDE, поле и - пока
 * ход идёт - Stop в ряду поля, как в IDE: под большим пальцем, а не в углу шапки.
 */
export const ConversationFooter = ({
  conversation,
  draftKey,
  deciding,
  stopping,
  onDecide,
  onSend,
  onStop,
}: {
  conversation: ConversationWire | undefined
  draftKey: string
  deciding: boolean
  stopping: boolean
  onDecide: (requestId: string, decision: Decision) => void
  onSend: (text: string, images: PreparedImage[]) => Promise<boolean>
  onStop: () => void
}) => {
  const { t } = useTranslation()
  const running = conversation?.status === 'running'

  return (
    <div className={styles.footer}>
      {conversation?.pending && (
        <PendingCard
          pending={conversation.pending}
          pendingCount={conversation.pendingCount}
          busy={deciding}
          onDecide={onDecide}
        />
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
        placeholder={running ? t('conversation.placeholderQueued') : t('conversation.placeholder')}
        sendLabel={t('conversation.send')}
        disabled={!conversation}
        actions={
          running && (
            <Button
              size="touch"
              variant="secondary"
              icon={Square}
              disabled={stopping}
              onClick={onStop}>
              {t('conversation.stop')}
            </Button>
          )
        }
        onSend={onSend}
      />
    </div>
  )
}

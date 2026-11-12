import { X, ArrowUp, ArrowDown, SendHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import type { useConversationCommands } from '../ConversationScreen.hooks'
import styles from '../ConversationScreen.module.scss'

/**
 * Очередь сообщений в IDE над полем: каждое можно переставить (если их больше одного), отдать
 * модели сейчас (во время хода она прочтёт его на следующем шаге) или убрать. Текст обрезается,
 * кнопки остаются под палец. Если очередь стоит при свободном разговоре - короткая строка, чего
 * она ждёт.
 */
export const QueuedMessages = ({
  conversation,
  commands,
}: {
  conversation: ConversationWire
  commands: ReturnType<typeof useConversationCommands>
}) => {
  const { t } = useTranslation()
  const { queue, queueHold } = conversation
  const movable = queue.length > 1
  const busy = commands.isQueueBusy

  if (queue.length === 0) return null

  return (
    <div className={styles.queueBlock}>
      {queueHold && conversation.status === 'idle' && (
        <p className={styles.queueHold}>
          {t(`conversation.queueHold.${queueHold}`, { defaultValue: '' })}
        </p>
      )}
      <ul className={styles.queue} aria-label={t('conversation.queued')}>
        {queue.map((queued, index) => (
          <li key={queued.id} className={styles.queued}>
            <span className={styles.queuedMark}>{t('conversation.queuedMark')}</span>
            <span className={styles.queuedText}>
              {queued.text || t('conversation.queuedPhotos', { count: queued.imageCount })}
            </span>
            {movable && (
              <>
                <IconButton
                  icon={ArrowUp}
                  size="touch"
                  label={t('conversation.moveUp')}
                  disabled={busy || index === 0}
                  onClick={() => commands.handleMoveQueued(queued.id, index - 1)}
                />
                <IconButton
                  icon={ArrowDown}
                  size="touch"
                  label={t('conversation.moveDown')}
                  disabled={busy || index === queue.length - 1}
                  onClick={() => commands.handleMoveQueued(queued.id, index + 1)}
                />
              </>
            )}
            <IconButton
              icon={SendHorizontal}
              size="touch"
              label={t('conversation.sendNow')}
              disabled={busy}
              onClick={() => commands.handleSendQueued(queued.id)}
            />
            <IconButton
              icon={X}
              size="touch"
              label={t('conversation.unqueue')}
              disabled={busy}
              onClick={() => commands.handleUnqueue(queued.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

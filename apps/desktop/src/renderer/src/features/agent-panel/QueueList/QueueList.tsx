import { Fragment, useState } from 'react'
import { CornerUpLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { DraftChip } from '@shared/message-draft'

import { chipLabel } from '../chips.utils'
import { SEND_KEY_HINT } from '../composer.constants'
import { useComposerStore } from '../composer.store'
import { useConversationActions } from '../conversation-actions.hooks'
import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../panel.constants'
import type { PictureSource } from '../picture.types'
import { PictureLightbox } from '../PictureLightbox/PictureLightbox'
import { useTakeOut, useQueueDrag } from './QueueList.hooks'
import styles from './QueueList.module.scss'
import type { OpenedPicture, QueueListProps } from './QueueList.types'
import { editingIndex, queueHintKey } from './QueueList.utils'
import { QueueRow } from './parts/QueueRow'

/**
 * Очередь над полем, как в ACC: «QUEUED n will fire in order…», строки с номером, ручкой
 * для перестановки и сообщением чипами; стрелка возвращает сообщение в поле поправить, и
 * на его месте - пунктир, пока его правят. Send now - отправить сразу (во время хода
 * модель прочтёт на следующем шаге), × - убрать.
 */
export const QueueList = ({ conversation }: QueueListProps) => {
  const { t } = useTranslation()
  const { removeQueued, sendQueued } = useConversationActions()
  const editing = useComposerStore((store) => store.queueEdits[conversation.id])
  const { drag, grab, rowRef } = useQueueDrag(conversation)
  const takeOut = useTakeOut(conversation)
  const [opened, setOpened] = useState<OpenedPicture | null>(null)
  const { queue } = conversation
  const isRunning = conversation.status !== 'idle'
  // Без идущего хода ждать нечего: поправленное уйдёт по Send, места не держим.
  const editingAt = isRunning ? editingIndex(queue, editing) : -1
  const hint = t(queueHintKey(isRunning, conversation.queueHold), { count: queue.length })

  const handleOpenPicture = (source: PictureSource, chip: DraftChip) =>
    setOpened({ source, label: chipLabel(chip) })

  const handleClosePicture = () => setOpened(null)

  if (queue.length === 0 && editingAt < 0) return null

  const editingRow = (
    <div className={styles.editingRow}>
      <CornerUpLeft size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
      <span className={styles.editingText}>
        {t('agentPanel.queue.editing', {
          key: SEND_KEY_HINT,
          button: t('agentPanel.composer.queue'),
        })}
      </span>
    </div>
  )

  return (
    <section aria-label={t('agentPanel.queue.title')} className={styles.queueList}>
      <div className={styles.header}>
        <span className={styles.caption}>{t('agentPanel.queue.title')}</span>
        {queue.length > 0 && <span className={styles.hint}>{hint}</span>}
      </div>
      {queue.map((item, index) => (
        <Fragment key={item.id}>
          {index === editingAt && editingRow}
          <QueueRow
            item={item}
            index={index}
            isEditing={editing !== undefined}
            isDragging={drag?.from === index}
            isOver={drag !== null && drag.over === index && drag.from !== index}
            onGrab={grab(index)}
            onTakeOut={() => void takeOut(item.id)}
            onSendNow={() => void sendQueued(conversation.id, item.id)}
            onRemove={() => void removeQueued(conversation.id, item.id)}
            rowRef={rowRef(index)}
            conversationId={conversation.id}
            onOpenPicture={handleOpenPicture}
          />
        </Fragment>
      ))}
      {editingAt === queue.length && editingRow}
      {opened && (
        <PictureLightbox source={opened.source} label={opened.label} onClose={handleClosePicture} />
      )}
    </section>
  )
}

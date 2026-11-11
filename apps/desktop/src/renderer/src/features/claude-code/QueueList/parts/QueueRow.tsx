import clsx from 'clsx'
import { X, ArrowUp, CornerUpLeft, GripVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../QueueList.module.scss'
import type { QueueRowProps } from '../QueueList.types'
import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../../claude.constants'
import { QueueLine } from './QueueLine'

/**
 * Строка очереди: ручка, номер, сообщение чипами и действия. Пока одно сообщение
 * правится в поле, стрелки у остальных погашены: второе заменило бы первое, а первое
 * уже вне очереди.
 */
export const QueueRow = ({
  item,
  index,
  isEditing,
  isDragging,
  isOver,
  onGrab,
  onTakeOut,
  onSendNow,
  onRemove,
  rowRef,
  conversationId,
  onOpenPicture,
}: QueueRowProps) => {
  const { t } = useTranslation()

  return (
    <div
      ref={rowRef}
      className={clsx(styles.row, isDragging && styles.dragging, isOver && styles.over)}>
      <span
        className={styles.grip}
        role="button"
        tabIndex={-1}
        aria-label={t('claudeCode.queue.drag')}
        onPointerDown={onGrab}>
        <GripVertical size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
      </span>
      <span className={styles.number}>{index + 1}</span>
      <QueueLine item={item} conversationId={conversationId} onOpenPicture={onOpenPicture} />
      <IconButton
        icon={CornerUpLeft}
        size="sm"
        label={t('claudeCode.queue.edit')}
        disabled={isEditing}
        onClick={onTakeOut}
      />
      <IconButton
        icon={ArrowUp}
        size="sm"
        label={t('claudeCode.queue.sendNow')}
        onClick={onSendNow}
      />
      <IconButton icon={X} size="sm" label={t('claudeCode.queue.remove')} onClick={onRemove} />
    </div>
  )
}

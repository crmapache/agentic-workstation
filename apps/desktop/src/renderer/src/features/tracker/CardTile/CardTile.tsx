import type { MouseEvent, KeyboardEvent } from 'react'
import { clsx } from 'clsx'
import {
  Plus,
  Send,
  Pencil,
  Trash2,
  ArrowUp,
  ListPlus,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isInQueue } from '@shared/tracker'

import { ChoiceMark } from '@agentic-workstation/ui/ChoiceMark'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useTrackerActions } from '../tracker.actions'
import { useTrackerStore } from '../tracker.store'
import { ActionsMenu } from '../ActionsMenu/ActionsMenu'
import type { ActionItem } from '../ActionsMenu/ActionsMenu.types'
import { useBoard } from '../Board/Board.context'
import styles from './CardTile.module.scss'
import type { CardTileProps } from './CardTile.types'
import { CardMeta } from './parts/CardMeta'

/**
 * Карточка задачи или продолжения: галочка, заголовок, подзаголовок, начало описания и строка
 * срока, приоритета и сценария. Выполненная остаётся на своём месте, только гаснет. Нажатие
 * открывает её окно, перетаскивание - переносит; Alt+стрелки сдвигают на шаг. У последней в
 * цепочке под рукой - «+» следующего продолжения.
 */
export const CardTile = ({ card, groupId, followUp, rootId, onAddFollowUp }: CardTileProps) => {
  const { t } = useTranslation()
  const { press, draggingId, today, moveBy } = useBoard()
  const { apply } = useTrackerActions()
  const edit = useTrackerStore((state) => state.edit)
  const openSend = useTrackerStore((state) => state.openSend)
  const source = { kind: 'card' as const, id: card.id }
  const items: ActionItem[] = [
    { key: 'edit', icon: Pencil, label: t('tracker.card.edit'), onSelect: () => handleOpen() },
    {
      key: 'follow',
      icon: ListPlus,
      label: t('tracker.card.addFollowUp'),
      onSelect: () => edit({ kind: 'newCard', groupId, followUpOf: rootId }),
    },
    {
      key: 'send',
      icon: Send,
      label: t('tracker.card.send'),
      // Карточка, которая уже стоит в очереди, второй раз не уходит - главный процесс откажет.
      disabled: !card.scenario || isInQueue(card.run),
      onSelect: () => openSend({ kind: 'card', cardId: card.id }),
    },
    {
      key: 'back',
      icon: followUp ? ArrowLeft : ArrowUp,
      label: followUp ? t('tracker.card.moveLeft') : t('tracker.card.moveUp'),
      onSelect: () => moveBy(source, -1),
    },
    {
      key: 'forward',
      icon: followUp ? ArrowRight : ArrowDown,
      label: followUp ? t('tracker.card.moveRight') : t('tracker.card.moveDown'),
      onSelect: () => moveBy(source, 1),
    },
    {
      key: 'delete',
      icon: Trash2,
      label: t('tracker.card.delete'),
      danger: true,
      onSelect: () => void apply({ kind: 'card.delete', id: card.id }),
    },
  ]

  const handleOpen = () => edit({ kind: 'card', cardId: card.id })
  // Заголовок - кнопка для клавиатуры: открывает сам и не даёт нажатию дойти до плитки,
  // иначе окно открывалось бы дважды.
  const handleTitleClick = (event: MouseEvent) => {
    event.stopPropagation()
    handleOpen()
  }
  const handleToggle = (event: MouseEvent) => {
    event.stopPropagation()
    void apply({ kind: 'card.update', id: card.id, fields: { done: !card.done } })
  }
  const handleStop = (event: MouseEvent) => event.stopPropagation()
  const handleAddFollowUp = (event: MouseEvent) => {
    event.stopPropagation()
    onAddFollowUp?.()
  }
  const handleKey = (event: KeyboardEvent) => {
    if (!event.altKey) return

    const back = followUp ? 'ArrowLeft' : 'ArrowUp'
    const forward = followUp ? 'ArrowRight' : 'ArrowDown'

    if (event.key !== back && event.key !== forward) return

    event.preventDefault()
    moveBy(source, event.key === back ? -1 : 1)
  }

  return (
    <div
      data-card={card.id}
      data-group={groupId}
      data-follow-up={followUp}
      className={clsx(
        styles.card,
        card.done && styles.done,
        draggingId === card.id && styles.dragging,
      )}
      onMouseDown={(event) => press(event, source)}
      onClick={handleOpen}>
      <button
        type="button"
        className={styles.check}
        aria-pressed={card.done}
        aria-label={card.done ? t('tracker.card.markUndone') : t('tracker.card.markDone')}
        onMouseDown={handleStop}
        onClick={handleToggle}>
        <ChoiceMark shape="square" checked={card.done} tone="success" />
      </button>
      <div className={styles.text}>
        <button
          type="button"
          className={styles.title}
          onClick={handleTitleClick}
          onKeyDown={handleKey}>
          {card.title}
        </button>
        {card.subtitle && <span className={styles.subtitle}>{card.subtitle}</span>}
      </div>
      <div className={styles.actions}>
        {onAddFollowUp && (
          <span onMouseDown={handleStop} onClick={handleAddFollowUp}>
            <IconButton icon={Plus} size="xs" label={t('tracker.card.addFollowUp')} />
          </span>
        )}
        <ActionsMenu label={t('tracker.card.menu', { title: card.title })} items={items} />
      </div>
      {card.description && <p className={styles.description}>{card.description}</p>}
      <CardMeta card={card} today={today} />
    </div>
  )
}

import type { MouseEvent, KeyboardEvent } from 'react'
import { clsx } from 'clsx'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ChoiceMark } from '@agentic-workstation/ui/ChoiceMark'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useTrackerActions } from '../tracker.actions'
import { useTrackerStore } from '../tracker.store'
import { ActionsMenu } from '../ActionsMenu/ActionsMenu'
import { useBoard } from '../Board/Board.context'
import { useCardMenu } from './CardTile.hooks'
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
  const source = { kind: 'card' as const, id: card.id }
  const items = useCardMenu({ card, groupId, followUp, rootId })

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

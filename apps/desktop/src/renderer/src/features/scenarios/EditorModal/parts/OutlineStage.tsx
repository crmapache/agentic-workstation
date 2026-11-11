import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import styles from '../EditorModal.module.scss'
import type { OutlineStageProps } from '../EditorModal.types'
import { stageNote } from '../EditorModal.utils'

/**
 * Этап в оглавлении: номер, имя, как ходит («×3, until done», «per item») и сколько в нём
 * карточек. У открытого этапа под ним - его карточки: клик ведёт к карточке, а не к этапу.
 */
export const OutlineStage = ({ stage, number, at, onPlace }: OutlineStageProps) => {
  const { t } = useTranslation()
  const isOpen = at.part === 'stage' && at.stageId === stage.id
  const openCard = at.part === 'stage' ? at.cardId : undefined
  const note = stageNote(t, stage, true)

  return (
    <>
      <button
        type="button"
        aria-current={isOpen || undefined}
        className={clsx(styles.outlineRow, isOpen && styles.selected)}
        onClick={() => onPlace({ part: 'stage', stageId: stage.id })}>
        <span className={styles.number}>{number}</span>
        <span className={styles.outlineText}>
          <span>{stage.title.trim() || t('scenarios.editor.untitledStage')}</span>
          {note && <span className={styles.outlineNote}>{note}</span>}
        </span>
        <span className={styles.outlineCount}>{stage.cards.length}</span>
      </button>
      {isOpen &&
        stage.cards.map((card) => (
          <button
            key={card.id}
            type="button"
            aria-current={openCard === card.id || undefined}
            className={clsx(styles.outlineCard, openCard === card.id && styles.selected)}
            onClick={() => onPlace({ part: 'stage', stageId: stage.id, cardId: card.id })}>
            {card.title.trim() || t('scenarios.editor.untitledCard')}
          </button>
        ))}
    </>
  )
}

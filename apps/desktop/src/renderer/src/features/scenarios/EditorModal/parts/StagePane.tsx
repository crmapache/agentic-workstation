import { X, Plus, ArrowUp, ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../EditorModal.module.scss'
import type { StagePaneProps } from '../EditorModal.types'
import { stageNote } from '../EditorModal.utils'
import { blankCard } from '../../scenarios-blank.utils'
import { withCard, movedCard, withoutCard, withCopiedCard } from '../../scenarios-editor.utils'
import { CardEditor } from './CardEditor'
import { StageRuns } from './StageRuns'

/**
 * Один этап в правой части: имя и порядок, как он ходит, и все его карточки одна под другой.
 * Последний этап не удаляется, и кнопка говорит об этом сама: сценарий - это его этапы, а
 * пустой сценарий - экран с плюсом.
 */
export const StagePane = ({
  stage,
  number,
  total,
  openCard,
  onStage,
  onMove,
  onRemove,
}: StagePaneProps) => {
  const { t } = useTranslation()
  const note = stageNote(t, stage, false)
  const isLast = total === 1

  return (
    <>
      <div className={styles.paneLabel}>
        <span className={styles.paneLabelText}>
          {t('scenarios.editor.stage.head', {
            number,
            title: stage.title.trim() || t('scenarios.editor.untitledStage'),
          })}
        </span>
        <span className={styles.paneRule} />
        {note && <span className={styles.paneNote}>{note}</span>}
      </div>
      <div className={styles.row}>
        <div className={styles.grow}>
          <TextField
            label={t('scenarios.editor.stage.title')}
            hideLabel
            value={stage.title}
            placeholder={t('scenarios.editor.stage.title')}
            onChange={(title) => onStage((one) => ({ ...one, title }))}
          />
        </div>
        <IconButton
          icon={ArrowUp}
          label={t('scenarios.editor.stage.moveUp')}
          disabled={number === 1}
          onClick={() => onMove(-1)}
        />
        <IconButton
          icon={ArrowDown}
          label={t('scenarios.editor.stage.moveDown')}
          disabled={number === total}
          onClick={() => onMove(1)}
        />
        <IconButton
          icon={X}
          label={
            isLast ? t('scenarios.editor.stage.lastStage') : t('scenarios.editor.stage.remove')
          }
          aria-disabled={isLast}
          onClick={onRemove}
        />
      </div>
      <StageRuns stage={stage} onStage={onStage} />
      {stage.cards.map((card, index) => (
        <CardEditor
          key={card.id}
          card={card}
          number={index + 1}
          first={index === 0}
          last={index === stage.cards.length - 1}
          open={openCard === card.id}
          onCard={(change) => onStage((one) => withCard(one, card.id, change))}
          onMove={(by) => onStage((one) => movedCard(one, card.id, by))}
          onCopy={() => onStage((one) => withCopiedCard(one, card.id, blankCard().id))}
          onRemove={() => onStage((one) => withoutCard(one, card.id))}
        />
      ))}
      <Button
        variant="dashed"
        icon={Plus}
        onClick={() => onStage((one) => ({ ...one, cards: [...one.cards, blankCard()] }))}>
        {t('scenarios.editor.stage.addCard')}
      </Button>
    </>
  )
}

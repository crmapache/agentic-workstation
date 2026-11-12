import { X, Copy, ArrowUp, ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../EditorModal.module.scss'
import type { CardHeadProps } from '../EditorModal.types'

/**
 * Шапка карточки: номер, имя (обычным полем, как имя этапа, и кнопки ростом с поле), «Same as
 * the main thread», пока карточка ничего не решает сама, и порядок - вверх, вниз, копия, удалить.
 */
export const CardHead = ({
  card,
  number,
  first,
  last,
  onTitle,
  onMove,
  onCopy,
  onRemove,
}: CardHeadProps) => {
  const { t } = useTranslation()
  const inherits = !card.model && !card.effort && !card.permissionMode

  return (
    <div className={styles.cardHead}>
      <span className={styles.number}>{number}</span>
      <div className={styles.cardTitle}>
        <TextField
          label={t('scenarios.editor.card.title')}
          hideLabel
          value={card.title}
          placeholder={t('scenarios.editor.card.titleHint')}
          onChange={onTitle}
        />
      </div>
      {inherits && <span className={styles.inherits}>{t('scenarios.editor.card.sameAsHead')}</span>}
      <IconButton
        icon={ArrowUp}
        label={t('scenarios.editor.card.moveUp')}
        disabled={first}
        onClick={() => onMove(-1)}
      />
      <IconButton
        icon={ArrowDown}
        label={t('scenarios.editor.card.moveDown')}
        disabled={last}
        onClick={() => onMove(1)}
      />
      <IconButton icon={Copy} label={t('scenarios.editor.card.duplicate')} onClick={onCopy} />
      <IconButton icon={X} label={t('scenarios.editor.card.remove')} onClick={onRemove} />
    </div>
  )
}

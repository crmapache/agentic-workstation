import { X, Copy, ArrowUp, ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../EditorModal.module.scss'
import type { CardHeadProps } from '../EditorModal.types'

/**
 * Шапка карточки: номер, имя (правится на месте), «Same as the main thread», пока карточка
 * ничего не решает сама, и порядок - вверх, вниз, копия, удалить.
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
      <input
        className={styles.cardTitle}
        aria-label={t('scenarios.editor.card.title')}
        value={card.title}
        placeholder={t('scenarios.editor.card.titleHint')}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onTitle(event.target.value)}
      />
      {inherits && <span className={styles.inherits}>{t('scenarios.editor.card.sameAsHead')}</span>}
      <IconButton
        icon={ArrowUp}
        size="sm"
        label={t('scenarios.editor.card.moveUp')}
        disabled={first}
        onClick={() => onMove(-1)}
      />
      <IconButton
        icon={ArrowDown}
        size="sm"
        label={t('scenarios.editor.card.moveDown')}
        disabled={last}
        onClick={() => onMove(1)}
      />
      <IconButton
        icon={Copy}
        size="sm"
        label={t('scenarios.editor.card.duplicate')}
        onClick={onCopy}
      />
      <IconButton icon={X} size="sm" label={t('scenarios.editor.card.remove')} onClick={onRemove} />
    </div>
  )
}

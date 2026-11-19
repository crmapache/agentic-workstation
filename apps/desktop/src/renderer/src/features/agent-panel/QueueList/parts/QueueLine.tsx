import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import styles from '../QueueList.module.scss'
import type { QueueLineProps } from '../QueueList.types'
import { queuePictures } from '../QueueList.utils'
import { chipLabel } from '../../chips.utils'
import { DraftChipView } from '../../DraftChipView/DraftChipView'

/**
 * Сообщение очереди так, как его набирали: слова и чипы вложений, цитаты - первыми
 * (без предмета «исправь это» ничего не говорит). Картинка под курсором показывает себя
 * и открывается кликом (как в ACC). Сообщение без кусков - текстом и числом картинок.
 */
export const QueueLine = ({ item, conversationId, onOpenPicture }: QueueLineProps) => {
  const { t } = useTranslation()
  const { draft } = item
  const pictures = useMemo(
    () => (draft ? queuePictures(draft.tokens, conversationId, item.id) : []),
    [draft, conversationId, item.id],
  )

  if (!draft) {
    return (
      <span className={styles.line}>
        {item.text}
        {item.imageCount > 0 && (
          <span className={styles.images}>
            {t('agentPanel.queue.images', { count: item.imageCount })}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className={styles.line}>
      {draft.quotes.map((quote, index) => (
        <span key={`quote-${index}`} className={styles.quote}>
          {quote}
        </span>
      ))}
      {draft.tokens.map((token, index) => {
        if (token.kind === 'text') return <span key={index}>{token.value}</span>

        const picture = pictures[index] ?? null

        return picture ? (
          <button
            key={index}
            type="button"
            className={styles.chipButton}
            aria-label={t('agentPanel.picture.open', { name: chipLabel(token.chip) })}
            onClick={() => onOpenPicture(picture, token.chip)}>
            <DraftChipView chip={token.chip} picture={picture} opens contained />
          </button>
        ) : (
          <DraftChipView key={index} chip={token.chip} contained />
        )
      })}
    </span>
  )
}

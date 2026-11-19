import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import styles from '../ListingModal.module.scss'
import type { ListingPartProps } from '../ListingModal.types'
import { useStoreActions } from '../../../store.actions'
import { storeErrorText } from '../../../store.utils'
import { Stars } from './Stars'

/** Свой отзыв: оценка звёздами и слова. Только у поставленного и не у своего расширения. */
export const ReviewForm = ({ view }: ListingPartProps) => {
  const { t } = useTranslation()
  const actions = useStoreActions()
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  if (!view.installed || view.installed.local || view.mine) return null

  const handleSend = async () => {
    const result = await actions.review(view.listing.id, rating, text)

    setNote(
      result.ok
        ? { ok: true, text: t('extensions.store.listing.sent') }
        : { ok: false, text: storeErrorText(t, result) },
    )
  }

  return (
    <div className={styles.stack}>
      <Stars value={rating} onPick={setRating} />
      <TextArea label={t('extensions.store.listing.reviewText')} value={text} onChange={setText} />
      <div>
        <Button
          size="sm"
          variant="primary"
          disabled={rating === 0}
          onClick={() => void handleSend()}>
          {t('extensions.store.listing.send')}
        </Button>
      </div>
      {note && <p className={note.ok ? styles.note : styles.failure}>{note.text}</p>}
    </div>
  )
}

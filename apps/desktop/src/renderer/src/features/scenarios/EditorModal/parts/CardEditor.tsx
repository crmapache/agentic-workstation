import { useId, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { NAME_SAMPLE } from '../EditorModal.constants'
import styles from '../EditorModal.module.scss'
import type { CardEditorProps } from '../EditorModal.types'
import { slotMention, inputMention } from '../EditorModal.utils'
import { CardHead } from './CardHead'
import { LongField } from './LongField'
import { PromptField } from './PromptField'
import { RunsOn } from './RunsOn'
import { SlotRows } from './SlotRows'

/**
 * Карточка этапа целиком: что сказать её сессии, по чему голова судит «готово», что делать
 * после, какие слоты голова заполняет и на чём карточка идёт. Карточка, на которую указало
 * оглавление, подводится к глазам один раз - не на каждое нажатие в соседней.
 */
export const CardEditor = ({
  card,
  number,
  first,
  last,
  open,
  onCard,
  onMove,
  onCopy,
  onRemove,
}: CardEditorProps) => {
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const promptId = useId()

  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'start' })
  }, [open])

  return (
    <section
      ref={ref}
      aria-label={card.title.trim() || t('scenarios.editor.untitledCard')}
      className={clsx(styles.card, open && styles.cardOpen)}>
      <CardHead
        card={card}
        number={number}
        first={first}
        last={last}
        onTitle={(title) => onCard((one) => ({ ...one, title }))}
        onMove={onMove}
        onCopy={onCopy}
        onRemove={onRemove}
      />
      <div className={styles.field}>
        <label htmlFor={promptId} className={styles.fieldLabel}>
          {t('scenarios.editor.card.prompt')}
        </label>
        <PromptField
          id={promptId}
          value={card.prompt}
          placeholder={t('scenarios.editor.card.promptHint', {
            input: inputMention(NAME_SAMPLE),
            slot: slotMention(NAME_SAMPLE),
          })}
          onChange={(prompt) => onCard((one) => ({ ...one, prompt }))}
        />
      </div>
      <div className={styles.pair}>
        <LongField
          label={t('scenarios.editor.card.dod')}
          value={card.dod}
          placeholder={t('scenarios.editor.card.dodHint')}
          onChange={(dod) => onCard((one) => ({ ...one, dod }))}
        />
        <LongField
          label={t('scenarios.editor.card.after')}
          value={card.after}
          placeholder={t('scenarios.editor.card.afterHint')}
          onChange={(after) => onCard((one) => ({ ...one, after }))}
        />
      </div>
      <SlotRows
        slots={card.slots}
        onSlots={(change) => onCard((one) => ({ ...one, slots: change(one.slots) }))}
      />
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('scenarios.editor.card.runsOn')}</span>
        <RunsOn
          value={card}
          fallback="head"
          onChange={(patch) => onCard((one) => ({ ...one, ...patch }))}
        />
      </div>
    </section>
  )
}

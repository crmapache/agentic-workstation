import { X, Plus, Brackets } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { CardSlot } from '@shared/scenarios'

import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { TextField } from '@agentic-workstation/ui/TextField'

import { NAME_SAMPLE } from '../EditorModal.constants'
import styles from '../EditorModal.module.scss'
import type { SlotRowsProps } from '../EditorModal.types'
import { isBadName, slotMention } from '../EditorModal.utils'
import { blankSlot } from '../../scenarios-blank.utils'

/**
 * SLOTS IT FILLS - то, что голова вписывает в промпт перед стартом карточки: имя (в промпте -
 * `[[имя]]`) и что туда положить. Слот - для того, что знает только прогон, а не для того,
 * что лежит на диске.
 */
export const SlotRows = ({ slots, onSlots }: SlotRowsProps) => {
  const { t } = useTranslation()

  const handleSlot = (slotId: string, patch: Partial<CardSlot>) =>
    onSlots((list) => list.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)))

  const handleRemove = (slotId: string) =>
    onSlots((list) => list.filter((slot) => slot.id !== slotId))

  const handleAdd = () => onSlots((list) => [...list, blankSlot()])

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{t('scenarios.editor.card.slots')}</span>
      {slots.length === 0 && (
        <p className={styles.note}>
          {t('scenarios.editor.card.noSlots', { slot: slotMention(NAME_SAMPLE) })}
        </p>
      )}
      {slots.map((slot) => (
        <div key={slot.id} className={styles.row}>
          <div className={styles.slotName}>
            <TextField
              label={t('scenarios.editor.card.slotName')}
              hideLabel
              icon={Brackets}
              value={slot.name}
              placeholder={t('scenarios.editor.card.slotPlaceholder')}
              error={isBadName(slot.name) ? t('scenarios.editor.badName') : undefined}
              onChange={(name) => handleSlot(slot.id, { name })}
            />
          </div>
          <div className={styles.grow}>
            <TextField
              label={t('scenarios.editor.card.slotDescription')}
              hideLabel
              value={slot.description}
              placeholder={t('scenarios.editor.card.slotDescription')}
              onChange={(description) => handleSlot(slot.id, { description })}
            />
          </div>
          <IconButton
            icon={X}
            label={t('scenarios.editor.card.removeSlot')}
            onClick={() => handleRemove(slot.id)}
          />
        </div>
      ))}
      <div className={styles.addRow}>
        <Button size="sm" variant="secondary" icon={Plus} onClick={handleAdd}>
          {t('scenarios.editor.card.addSlot')}
        </Button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { TextField } from '@agentic-workstation/ui/TextField'

import { REMINDER_UNIT_MINUTES } from '../SettingsDialog.constants'
import styles from '../SettingsDialog.module.scss'
import type { ReminderRowProps } from '../SettingsDialog.types'
import { reminderParts, reminderAmount } from '../SettingsDialog.utils'
import type { ReminderUnit } from '../../settings.types'
import { PickButton } from './PickButton'

/**
 * Напоминание о звонке: число и единица («10 minutes before»), крестик убирает. Число уходит в
 * главный процесс, когда поле отпустили: иначе напоминания переставлялись бы по порядку прямо
 * под набором.
 */
export const ReminderRow = ({ index, minutes, onChange, onRemove }: ReminderRowProps) => {
  const { t } = useTranslation()
  const parts = reminderParts(minutes)
  const [typed, setTyped] = useState(String(parts.amount))
  const units = (['minutes', 'hours', 'days'] as const).map((unit) => ({
    value: unit,
    label: t(`settings.calendar.units.${unit}`),
  }))

  const handleCommit = () => {
    const amount = reminderAmount(typed)

    if (amount === null) setTyped(String(parts.amount))
    else if (amount * REMINDER_UNIT_MINUTES[parts.unit] !== minutes) {
      onChange(amount * REMINDER_UNIT_MINUTES[parts.unit])
    }
  }

  const handleUnit = (unit: string) =>
    onChange(parts.amount * REMINDER_UNIT_MINUTES[unit as ReminderUnit])

  return (
    <div className={styles.reminder}>
      <div className={styles.reminderAmount}>
        <TextField
          label={t('settings.calendar.reminderN', { index: index + 1 })}
          hideLabel
          inputMode="numeric"
          spellCheck={false}
          value={typed}
          onChange={setTyped}
          onBlur={handleCommit}
          onKeyDown={(key) => key.key === 'Enter' && handleCommit()}
        />
      </div>
      <PickButton
        label={t('settings.calendar.reminderUnit')}
        value={parts.unit}
        options={units}
        onPick={handleUnit}
      />
      <IconButton
        icon={X}
        size="md"
        label={t('settings.calendar.removeReminder', { index: index + 1 })}
        onClick={onRemove}
      />
    </div>
  )
}

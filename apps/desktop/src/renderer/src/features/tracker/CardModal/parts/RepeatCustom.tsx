import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { TrackerRepeat } from '@shared/tracker'
import { TRACKER_REPEAT_UNITS } from '@shared/tracker'
import { dueForRule } from '@shared/tracker-repeat'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'
import { Switch } from '@agentic-workstation/ui/Switch'
import { TextField } from '@agentic-workstation/ui/TextField'
import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import styles from '../CardModal.module.scss'
import type { RepeatCustomProps } from '../CardModal.types'
import { everyOf, startWeekdays } from '../CardModal.utils'
import { WEEKDAYS } from '../../tracker.constants'
import { weekdayNames } from '../../../../lib/dates.utils'

/**
 * Своё правило повтора: каждые N дней, недель, месяцев или лет, дни недели у недельного и счёт
 * от выполнения вместо расписания. Последний день недели не снимается: неделя без дней не
 * повторялась бы никогда.
 */
export const RepeatCustom = ({ form, repeat, today }: RepeatCustomProps) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(String(repeat.every))
  const names = weekdayNames()
  const units = TRACKER_REPEAT_UNITS.map((unit) => ({
    value: unit,
    label: t(`tracker.repeat.units.${unit}`, { count: repeat.every }),
  }))
  const byWeekdays = repeat.unit === 'week' && !repeat.fromDone
  // Срок идёт за правилом: снятый день недели переносит срок на ближайший оставшийся.
  const set = (patch: Partial<TrackerRepeat>) => {
    const rule = { ...repeat, ...patch }

    form.set('repeat', rule)
    form.set('due', dueForRule(rule, form.due, today))
  }

  const handleEvery = (text: string) => {
    const every = everyOf(text)

    setDraft(text)
    if (every !== null) set({ every })
  }
  const handleEveryBlur = () => setDraft(String(repeat.every))
  const handleUnit = (value: string) => {
    const unit = TRACKER_REPEAT_UNITS.find((one) => one === value)

    if (!unit || unit === repeat.unit) return

    set({
      unit,
      weekdays: unit === 'week' && !repeat.fromDone ? startWeekdays(repeat) : [],
    })
  }
  const handleDay = (day: number) => (pressed: boolean) => {
    const weekdays = pressed
      ? [...repeat.weekdays, day].sort((a, b) => a - b)
      : repeat.weekdays.filter((one) => one !== day)

    if (weekdays.length > 0) set({ weekdays })
  }
  const handleFromDone = (fromDone: boolean) =>
    set({
      fromDone,
      weekdays: !fromDone && repeat.unit === 'week' ? startWeekdays(repeat) : [],
    })

  return (
    <>
      <div className={styles.row}>
        <TextField
          label={t('tracker.repeat.every')}
          inputMode="numeric"
          spellCheck={false}
          value={draft}
          onChange={handleEvery}
          onBlur={handleEveryBlur}
        />
        <ChoiceField
          label={t('tracker.repeat.unit')}
          value={repeat.unit}
          options={units}
          onPick={handleUnit}
        />
      </div>
      {byWeekdays && (
        <div className={styles.field}>
          <span className={styles.caption}>{t('tracker.repeat.days')}</span>
          <div className={styles.days}>
            {WEEKDAYS.map((day) => (
              <ToggleChip
                key={day}
                label={names[day - 1] ?? ''}
                pressed={repeat.weekdays.includes(day)}
                onChange={handleDay(day)}
              />
            ))}
          </div>
        </div>
      )}
      <Switch
        label={t('tracker.repeat.fromDone')}
        description={t('tracker.repeat.fromDoneHint')}
        checked={repeat.fromDone}
        onChange={handleFromDone}
      />
    </>
  )
}

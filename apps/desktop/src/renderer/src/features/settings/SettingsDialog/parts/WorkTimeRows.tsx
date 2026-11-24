import { useTranslation } from 'react-i18next'

import { TimeField } from '@agentic-workstation/ui/TimeField'
import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import styles from '../SettingsDialog.module.scss'
import type { WorkTimeRowsProps } from '../SettingsDialog.types'
import { weekdayNames } from '../../../../lib/dates.utils'
import { SettingRow } from './SettingRow'

/** Шаг минут рабочего времени: четверть часа - так ставят начало и конец дня. */
const WORK_MINUTE_STEP = 15

/**
 * Рабочее время календаря: часы «с» и «до» (конец позже начала, иначе главный процесс оставит
 * прежнее) и рабочие дни чипами с понедельника.
 */
export const WorkTimeRows = ({ settings, onChange }: WorkTimeRowsProps) => {
  const { t } = useTranslation()
  const { from, to } = settings.workHours
  // Подписи с понедельника, а дни календаря - по Date.getDay (0 - воскресенье).
  const days = weekdayNames().map((label, index) => ({ label, day: (index + 1) % 7 }))

  const handleDay = (day: number, on: boolean) =>
    onChange({
      workDays: on ? [...settings.workDays, day] : settings.workDays.filter((one) => one !== day),
    })

  return (
    <>
      <SettingRow
        label={t('settings.calendar.workHours')}
        description={t('settings.calendar.workHoursNote')}>
        <div className={styles.workHours}>
          <TimeField
            label={t('settings.calendar.from')}
            hourLabel={t('settings.calendar.hour')}
            minuteLabel={t('settings.calendar.minute')}
            value={from}
            minuteStep={WORK_MINUTE_STEP}
            onChange={(next) => onChange({ workHours: { from: next, to } })}
          />
          <TimeField
            label={t('settings.calendar.to')}
            hourLabel={t('settings.calendar.hour')}
            minuteLabel={t('settings.calendar.minute')}
            value={Math.min(to, 23 * 60 + 45)}
            minuteStep={WORK_MINUTE_STEP}
            onChange={(next) => onChange({ workHours: { from, to: next } })}
          />
        </div>
      </SettingRow>
      <SettingRow
        label={t('settings.calendar.workDays')}
        description={t('settings.calendar.workDaysNote')}>
        <div className={styles.days}>
          {days.map(({ label, day }) => (
            <ToggleChip
              key={day}
              label={label}
              size="sm"
              pressed={settings.workDays.includes(day)}
              onChange={(on) => handleDay(day, on)}
            />
          ))}
        </div>
      </SettingRow>
    </>
  )
}

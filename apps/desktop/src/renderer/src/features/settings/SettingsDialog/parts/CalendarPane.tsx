import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { MorningSync } from '@shared/calendar-settings'
import {
  REMINDERS_MAX,
  MORNING_SYNC_MODES,
  DEFAULT_CALENDAR_SETTINGS,
} from '@shared/calendar-settings'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'
import { Switch } from '@agentic-workstation/ui/Switch'

import { REMINDER_PRESETS } from '../SettingsDialog.constants'
import styles from '../SettingsDialog.module.scss'
import { useCalendar, useSetCalendarSettings } from '../../../../state/calendar.queries'
import { PickButton } from './PickButton'
import { ReminderRow } from './ReminderRow'
import { SettingRow } from './SettingRow'
import { WorkTimeRows } from './WorkTimeRows'

/**
 * Раздел «Calendar» (ADR 0116): рабочее время и дни (подсветка сетки, начало утреннего синка),
 * уведомления о накладках, до трёх напоминаний о звонке и что делать утром с календарями,
 * которые читает ИИ. Владелец настроек - главный процесс, всё меняется сразу.
 */
export const CalendarPane = () => {
  const { t } = useTranslation()
  const settings = useCalendar().data?.settings ?? DEFAULT_CALENDAR_SETTINGS
  const save = useSetCalendarSettings()
  const { reminders } = settings
  const morningOptions = MORNING_SYNC_MODES.map((mode) => ({
    value: mode,
    label: t(`settings.calendar.morningModes.${mode}`),
  }))

  const saveReminders = (next: number[]) => void save({ reminders: next })

  const handleReminder = (index: number, minutes: number) =>
    saveReminders(reminders.map((one, at) => (at === index ? minutes : one)))

  const handleRemove = (index: number) => saveReminders(reminders.filter((_, at) => at !== index))

  // Новое - первое из обычных, которого ещё нет: два одинаковых главный процесс слил бы в одно.
  const handleAdd = () => {
    const next = REMINDER_PRESETS.find((minutes) => !reminders.includes(minutes))

    saveReminders([...reminders, next ?? Math.max(0, ...reminders) + 60])
  }

  return (
    <Section
      title={t('settings.sections.calendar')}
      description={t('settings.calendar.description')}
      help={
        <HelpButton
          label={t('settings.calendar.helpLabel')}
          title={t('settings.sections.calendar')}
          text={t('settings.calendar.help')}
          closeLabel={t('common.close')}
        />
      }>
      <Card title={t('settings.calendar.workTitle')}>
        <div className={styles.rows}>
          <WorkTimeRows settings={settings} onChange={(patch) => void save(patch)} />
        </div>
      </Card>
      <Card title={t('settings.calendar.notifyTitle')}>
        <div className={styles.rows}>
          <SettingRow
            label={t('settings.calendar.notify')}
            description={t('settings.calendar.notifyNote')}>
            <Switch
              label={t('settings.calendar.notify')}
              labelHidden
              checked={settings.notifyOverlaps}
              onChange={(notifyOverlaps) => void save({ notifyOverlaps })}
            />
          </SettingRow>
          <SettingRow
            label={t('settings.calendar.reminders')}
            description={t('settings.calendar.remindersNote')}
            wide>
            <div className={styles.reminders}>
              {reminders.length === 0 && (
                <span className={styles.footnote}>{t('settings.calendar.noReminders')}</span>
              )}
              {reminders.map((minutes, index) => (
                <ReminderRow
                  key={`${index}-${minutes}`}
                  index={index}
                  minutes={minutes}
                  onChange={(next) => handleReminder(index, next)}
                  onRemove={() => handleRemove(index)}
                />
              ))}
              <Button
                variant="ghost"
                size="sm"
                icon={Plus}
                disabled={reminders.length >= REMINDERS_MAX}
                onClick={handleAdd}>
                {t('settings.calendar.addReminder')}
              </Button>
            </div>
          </SettingRow>
        </div>
      </Card>
      <Card title={t('settings.calendar.syncTitle')}>
        <SettingRow
          label={t('settings.calendar.morning')}
          description={t('settings.calendar.morningNote')}>
          <PickButton
            label={t('settings.calendar.morning')}
            value={settings.morningSync}
            options={morningOptions}
            onPick={(mode) => void save({ morningSync: mode as MorningSync })}
          />
        </SettingRow>
      </Card>
    </Section>
  )
}

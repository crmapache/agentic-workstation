import { useTranslation } from 'react-i18next'

import { SCHEDULE_REPEATS } from '@agentic-workstation/remote-protocol/scenario-commands'
import { Section } from '@agentic-workstation/ui/Section'
import { TextField } from '@agentic-workstation/ui/TextField'

import { WEEKDAYS } from '../ScheduleScreen.constants'
import type { useScheduleScreen } from '../ScheduleScreen.hooks'
import styles from '../ScheduleScreen.module.scss'
import { OptionList } from '../../../../shell/OptionList/OptionList'

/** Когда: час (по часам Mac), ритм и - у еженедельного - день недели. */
export const WhenFields = ({ screen }: { screen: ReturnType<typeof useScheduleScreen> }) => {
  const { t } = useTranslation()
  const { form, update } = screen

  return (
    <Section size="sm" title={t('schedule.when')}>
      <div className={styles.group}>
        <TextField
          size="touch"
          type="time"
          label={t('schedule.at')}
          value={form.time}
          onChange={(time) => update({ time })}
        />
        <OptionList
          label={t('schedule.repeat')}
          options={SCHEDULE_REPEATS.map((repeat) => ({
            value: repeat,
            label: t(`schedule.repeats.${repeat}`),
          }))}
          isSelected={(value) => value === form.repeat}
          onSelect={(repeat) => update({ repeat })}
        />
        {form.repeat === 'weekly' && (
          <OptionList
            label={t('schedule.weekday')}
            options={WEEKDAYS.map((day) => ({
              value: String(day),
              label: t(`schedule.weekdays.${day}`),
            }))}
            isSelected={(value) => value === String(form.weekday)}
            onSelect={(value) => update({ weekday: Number(value) })}
          />
        )}
      </div>
    </Section>
  )
}

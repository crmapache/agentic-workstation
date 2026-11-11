import { useTranslation } from 'react-i18next'

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { Section } from '@agentic-workstation/ui/Section'

import { DUE_TICK_MS, TIME_SEPARATOR } from '../ScheduleModal.constants'
import styles from '../ScheduleModal.module.scss'
import type { HourPickerProps } from '../ScheduleModal.types'
import { useNow } from '../../scenarios-clock.hooks'
import { hourOf, minuteOf, withHour, withMinute } from '../../scenarios-forms.utils'
import { pad2, HOURS, MINUTES, nextDue, countdown, whenLabel } from '../../scenarios-hours.utils'

/**
 * Час формы - двумя меню, а не полем type="time": браузер рисует его своей системной панелью,
 * чужой посреди тёмной формы. Минуты по пять: это договор с утром, а не будильник. Рядом -
 * когда это наступит, теми же словами, что у строки расписания.
 */
export const HourPicker = ({ hour, onChange }: HourPickerProps) => {
  const { t } = useTranslation()
  const hours = usePopover()
  const minutes = usePopover()
  const now = useNow(true, DUE_TICK_MS)
  // Сказать вслух, а не решить: срок считает главный процесс, час в прошлом - это завтра.
  const due = nextDue(hour, now)
  const hourLabel = t('scenarios.schedule.form.hour')
  const minuteLabel = t('scenarios.schedule.form.minute')

  const handleHour = (value: number) => {
    hours.close()
    onChange({ ...hour, at: withHour(hour.at, value) })
  }

  const handleMinute = (value: number) => {
    minutes.close()
    onChange({ ...hour, at: withMinute(hour.at, value) })
  }

  return (
    <Section size="sm" title={t('scenarios.schedule.form.at')}>
      <div className={styles.timeRow}>
        <DropdownButton
          {...hours.triggerProps}
          label={pad2(hourOf(hour.at))}
          menuLabel={hourLabel}
        />
        <span className={styles.timeColon} aria-hidden>
          {TIME_SEPARATOR}
        </span>
        <DropdownButton
          {...minutes.triggerProps}
          label={pad2(minuteOf(hour.at))}
          menuLabel={minuteLabel}
        />
        <span className={styles.due}>
          {t('scenarios.schedule.form.due', { when: whenLabel(due), time: countdown(due - now) })}
        </span>
      </div>
      <Popover {...hours.popoverProps}>
        {hours.isOpen && (
          <Menu label={hourLabel} autoFocus>
            {HOURS.map((value) => (
              <MenuItem
                key={value}
                label={pad2(value)}
                selection="single"
                checked={value === hourOf(hour.at)}
                onSelect={() => handleHour(value)}
              />
            ))}
          </Menu>
        )}
      </Popover>
      <Popover {...minutes.popoverProps}>
        {minutes.isOpen && (
          <Menu label={minuteLabel} autoFocus>
            {MINUTES.map((value) => (
              <MenuItem
                key={value}
                label={pad2(value)}
                selection="single"
                checked={value === minuteOf(hour.at)}
                onSelect={() => handleMinute(value)}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </Section>
  )
}

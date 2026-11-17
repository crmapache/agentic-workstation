import { Menu } from '../Menu/Menu'
import { MenuItem } from '../MenuItem/MenuItem'
import { Popover } from '../Popover/Popover'
import { usePopover } from '../Popover/Popover.hooks'
import { SelectField } from '../SelectField/SelectField'
import { HOURS, TIME_SEPARATOR, DEFAULT_MINUTE_STEP } from './TimeField.constants'
import styles from './TimeField.module.scss'
import type { TimeFieldProps } from './TimeField.types'
import { pad2, withHour, minutesOf, withMinute } from './TimeField.utils'

/**
 * Время формы - часом и минутами в двух узких SelectField со списками, а не полем type="time":
 * браузер рисует его своей системной панелью, чужой посреди тёмной формы. minutesOnly - только
 * минуты часа («каждый час в :15»); note - когда это наступит, справа от полей.
 */
export const TimeField = ({
  label,
  hourLabel,
  minuteLabel,
  value,
  onChange,
  minuteStep = DEFAULT_MINUTE_STEP,
  minutesOnly = false,
  note,
}: TimeFieldProps) => {
  const hours = usePopover()
  const minutes = usePopover()
  const hour = Math.floor(value / 60)
  const minute = value % 60

  const handleHour = (picked: number) => {
    hours.close()
    onChange(withHour(value, picked))
  }

  const handleMinute = (picked: number) => {
    minutes.close()
    onChange(withMinute(value, picked))
  }

  return (
    <div className={styles.timeField}>
      {/* Подпись одна на два поля; у каждого поля своё имя для скринридера - час и минуты. */}
      <span className={styles.label} aria-hidden>
        {label}
      </span>
      <div className={styles.row}>
        {!minutesOnly && (
          <>
            <SelectField
              {...hours.triggerProps}
              label={hourLabel}
              hideLabel
              value={pad2(hour)}
              fit
            />
            <span className={styles.colon} aria-hidden>
              {TIME_SEPARATOR}
            </span>
          </>
        )}
        <SelectField
          {...minutes.triggerProps}
          label={minuteLabel}
          hideLabel
          value={minutesOnly ? `${TIME_SEPARATOR}${pad2(minute)}` : pad2(minute)}
          fit
        />
        {note && <span className={styles.note}>{note}</span>}
      </div>
      <Popover {...hours.popoverProps}>
        {hours.isOpen && (
          <Menu label={hourLabel} autoFocus>
            {HOURS.map((option) => (
              <MenuItem
                key={option}
                label={pad2(option)}
                selection="single"
                checked={option === hour}
                onSelect={() => handleHour(option)}
              />
            ))}
          </Menu>
        )}
      </Popover>
      <Popover {...minutes.popoverProps}>
        {minutes.isOpen && (
          <Menu label={minuteLabel} autoFocus>
            {minutesOf(minuteStep, minute).map((option) => (
              <MenuItem
                key={option}
                label={pad2(option)}
                selection="single"
                checked={option === minute}
                onSelect={() => handleMinute(option)}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </div>
  )
}

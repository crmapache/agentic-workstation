import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { TrackerRepeat } from '@shared/tracker'
import { dueForRule, nextRepeat } from '@shared/tracker-repeat'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'

import styles from '../CardModal.module.scss'
import type { RepeatFieldProps } from '../CardModal.types'
import { menuRule, presetOf, presetRepeat } from '../CardModal.utils'
import { REPEAT_PRESETS } from '../../tracker.constants'
import { useRepeatLabel } from '../../tracker.hooks'
import { dueDayOf } from '../../tracker.utils'
import { isoDay, weekdayDayLabel } from '../../../../lib/dates.utils'
import { RepeatCustom } from './RepeatCustom'

/**
 * Повтор карточки, как в Todoist: готовые правила от дня срока («Every week on Fri», «Every month
 * on the 21st») и своё. Правило без срока ставит срок на свой первый день; под полем - куда
 * отметка «сделано» перенесёт срок, тем же счётом, что у главного процесса.
 */
export const RepeatField = ({ form, today, now }: RepeatFieldProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const label = useRepeatLabel()
  const { repeat, due } = form
  const [customPicked, setCustomPicked] = useState(false)
  // Пресет правила - от его начала, а не от срока: «сделано» сдвигает только срок, и месячное
  // правило на 31-е после февраля всё ещё «Every month on the 31st».
  const current = repeat ? presetOf(repeat, repeat.start) : null
  const isCustom = repeat !== null && (customPicked || current === null)
  const date = due?.date ?? isoDay(today)
  const next = repeat && due ? dueDayOf(nextRepeat(repeat, due, now)) : null
  const kept = repeat && current && !isCustom ? { preset: current, repeat } : null

  const handlePick = (rule: TrackerRepeat | null, custom: boolean) => {
    popover.close()
    setCustomPicked(custom)
    form.set('repeat', rule)
    // Срок под правило, как у главного процесса: без срока - первый день правила, не на день
    // правила (суббота у «Every weekday») - ближайший его день.
    if (rule) form.set('due', dueForRule(rule, due, isoDay(today)))
  }

  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <div>
          <SelectField
            {...popover.triggerProps}
            label={t('tracker.repeat.label')}
            value={repeat ? label(repeat) : t('tracker.repeat.none')}
          />
          <Popover {...popover.popoverProps} width="field">
            {popover.isOpen && (
              <Menu label={t('tracker.repeat.label')} autoFocus>
                <MenuItem
                  label={t('tracker.repeat.none')}
                  selection="single"
                  checked={!repeat}
                  onSelect={() => handlePick(null, false)}
                />
                {REPEAT_PRESETS.map((preset) => (
                  <MenuItem
                    key={preset}
                    label={label(menuRule(preset, kept, date))}
                    selection="single"
                    checked={!isCustom && preset === current}
                    onSelect={() => handlePick(menuRule(preset, kept, date), false)}
                  />
                ))}
                <MenuItem
                  label={t('tracker.repeat.custom')}
                  selection="single"
                  checked={isCustom}
                  onSelect={() => handlePick(repeat ?? presetRepeat('weekly', date), true)}
                />
              </Menu>
            )}
          </Popover>
        </div>
      </div>
      {isCustom && repeat && <RepeatCustom form={form} repeat={repeat} today={isoDay(today)} />}
      {next !== null && (
        <span className={styles.note}>
          {t('tracker.repeat.next', { when: weekdayDayLabel(next) })}
        </span>
      )}
    </div>
  )
}

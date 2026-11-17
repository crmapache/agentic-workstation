import { DatePicker } from '../DatePicker/DatePicker'
import { Popover } from '../Popover/Popover'
import { usePopover } from '../Popover/Popover.hooks'
import { SelectField } from '../SelectField/SelectField'
import styles from './DateField.module.scss'
import type { DateFieldProps } from './DateField.types'

/**
 * День формы: SelectField с датой словами, по нажатию - календарь месяца (DatePicker) во
 * всплывающей панели; выбранный день закрывает её. Не поле type="date": его системная панель
 * чужая посреди тёмной формы, как и у времени (TimeField).
 */
export const DateField = ({ label, valueLabel, onChange, ...picker }: DateFieldProps) => {
  const popover = usePopover()

  const handlePick = (day: number) => {
    popover.close()
    onChange(day)
  }

  return (
    <div className={styles.dateField}>
      <SelectField {...popover.triggerProps} label={label} value={valueLabel} fit />
      <Popover {...popover.popoverProps}>
        {popover.isOpen && <DatePicker {...picker} autoFocus onChange={handlePick} />}
      </Popover>
    </div>
  )
}

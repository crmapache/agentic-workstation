import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'

import { CALENDAR_COLORS } from '@shared/calendar'

import { Switch } from '@agentic-workstation/ui/Switch'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../SourceModal.module.scss'
import type { SourceFieldsProps } from '../SourceModal.types'

/** Имя, цвет на сетке и «учитывать в накладках» - у любого вида источника. */
export const CommonFields = ({ form, onChange }: SourceFieldsProps) => {
  const { t } = useTranslation()

  return (
    <>
      <div className={styles.row}>
        <div className={styles.grow}>
          <TextField
            label={t('calendar.form.name')}
            placeholder={t(`calendar.kinds.${form.kind}.placeholder`)}
            value={form.name}
            data-autofocus
            onChange={(name) => onChange({ name })}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.caption}>{t('calendar.form.color')}</span>
          <div className={styles.colors}>
            {CALENDAR_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={clsx(
                  styles.color,
                  styles[`tone${color}`],
                  form.color === color && styles.picked,
                )}
                aria-label={t('calendar.form.colorN', { index: color + 1 })}
                aria-pressed={form.color === color}
                onClick={() => onChange({ color })}
              />
            ))}
          </div>
        </div>
      </div>
      <Switch
        label={t('calendar.form.inOverlaps')}
        description={t('calendar.form.inOverlapsNote')}
        checked={form.inOverlaps}
        onChange={(inOverlaps) => onChange({ inOverlaps })}
      />
    </>
  )
}

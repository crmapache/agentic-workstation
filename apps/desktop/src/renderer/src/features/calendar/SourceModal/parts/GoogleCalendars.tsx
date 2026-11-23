import { useTranslation } from 'react-i18next'

import { Switch } from '@agentic-workstation/ui/Switch'

import styles from '../SourceModal.module.scss'
import type { SourceFieldsProps } from '../SourceModal.types'
import { useGoogleCalendars } from '../../../../state/calendar.queries'

/** Календари аккаунта Google галочками; ни одной - основной календарь аккаунта. */
export const GoogleCalendars = ({ form, onChange }: SourceFieldsProps) => {
  const { t } = useTranslation()
  const { data, isPending } = useGoogleCalendars(form.connectorId)

  if (isPending) return <span className={styles.note}>{t('calendar.form.calendarsLoading')}</span>
  if (!data?.ok) {
    return (
      <span className={styles.failure}>{t(`calendar.failures.${data?.failure ?? 'network'}`)}</span>
    )
  }

  // Пусто - значит «основной»: первое включение другого календаря его не снимает.
  const primary = data.calendars.find((calendar) => calendar.primary)
  const current = form.calendarIds.length || !primary ? form.calendarIds : [primary.id]
  const toggle = (id: string, on: boolean) =>
    onChange({ calendarIds: on ? [...current, id] : current.filter((one) => one !== id) })

  return (
    <div className={styles.field}>
      <span className={styles.caption}>{t('calendar.form.calendars')}</span>
      <div className={styles.calendars}>
        {data.calendars.map((calendar) => (
          <Switch
            key={calendar.id}
            label={calendar.name}
            description={calendar.primary ? t('calendar.form.primary') : undefined}
            checked={current.includes(calendar.id)}
            onChange={(on) => toggle(calendar.id, on)}
          />
        ))}
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'

import { Switch } from '@agentic-workstation/ui/Switch'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../SourceModal.module.scss'
import type { KindFieldsProps } from '../SourceModal.types'
import { BrowserProfileField } from './BrowserProfileField'
import { ConnectorField } from './ConnectorField'
import { GoogleCalendars } from './GoogleCalendars'

/** Поля выбранного вида: коннектор, календари, ссылка, страница, профиль Chrome, приложение. */
export const KindFields = ({ form, onChange, editing }: KindFieldsProps) => {
  const { t } = useTranslation()

  switch (form.kind) {
    case 'google':
      return (
        <>
          <ConnectorField form={form} onChange={onChange} />
          {form.connectorId && <GoogleCalendars form={form} onChange={onChange} />}
        </>
      )
    case 'ics':
      return (
        <div className={styles.field}>
          <TextField
            label={t('calendar.form.icsUrl')}
            placeholder={editing ? t('calendar.form.icsKeep') : 'https://… / webcal://…'}
            value={form.url}
            onChange={(url) => onChange({ url })}
          />
          <span className={styles.note}>{t('calendar.form.icsNote')}</span>
        </div>
      )
    case 'ai-browser':
      return (
        <>
          <ConnectorField form={form} onChange={onChange} />
          <TextField
            label={t('calendar.form.pageUrl')}
            placeholder="https://outlook.office.com/calendar/view/week"
            value={form.url}
            onChange={(url) => onChange({ url })}
          />
          <BrowserProfileField form={form} onChange={onChange} />
          <Switch
            label={t('calendar.form.allowClicks')}
            description={t('calendar.form.allowClicksNote')}
            checked={form.allowClicks}
            onChange={(allowClicks) => onChange({ allowClicks })}
          />
        </>
      )
    case 'ai-screen':
      return (
        <>
          <ConnectorField form={form} onChange={onChange} />
          <TextField
            label={t('calendar.form.app')}
            placeholder="Microsoft Outlook"
            value={form.app}
            onChange={(app) => onChange({ app })}
          />
        </>
      )
  }
}

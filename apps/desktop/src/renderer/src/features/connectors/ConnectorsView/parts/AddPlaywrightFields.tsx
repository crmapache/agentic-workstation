import { useTranslation } from 'react-i18next'

import { PLAYWRIGHT_PROFILES } from '@shared/connectors'

import { Switch } from '@agentic-workstation/ui/Switch'
import { Tabs } from '@agentic-workstation/ui/Tabs'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../ConnectorsView.module.scss'
import type { AddFormState } from '../ConnectorsView.types'

/**
 * Настройки браузера Playwright (ADR 0035): профиль чистый на каждый запуск или сохранённый
 * в папке (входы на сайтах живут между разговорами), браузер без окна и версия пакета -
 * пусто значит latest.
 */
export const AddPlaywrightFields = ({ form }: { form: AddFormState }) => {
  const { t } = useTranslation()

  return (
    <>
      <span className={styles.fieldLabel}>{t('connectors.add.playwright.profile')}</span>
      <Tabs
        label={t('connectors.add.playwright.profile')}
        items={PLAYWRIGHT_PROFILES.map((id) => ({
          id,
          label: t(`connectors.add.playwright.profiles.${id}`),
        }))}
        value={form.fields.profile}
        fill
        onChange={form.set('profile')}
      />
      {form.fields.profile === 'saved' && (
        <TextField
          label={t('connectors.add.playwright.profileDir')}
          placeholder={t('connectors.add.playwright.profileDirPlaceholder')}
          value={form.fields.profileDir}
          onChange={form.set('profileDir')}
          onKeyDown={form.handleKeyDown}
        />
      )}
      <div className={styles.formSwitch}>
        <Switch
          label={t('connectors.add.playwright.headless')}
          description={t('connectors.add.playwright.headlessHint')}
          checked={form.fields.headless}
          onChange={form.set('headless')}
        />
      </div>
      <TextField
        label={t('connectors.add.playwright.version')}
        placeholder={t('connectors.add.playwright.versionPlaceholder')}
        value={form.fields.version}
        onChange={form.set('version')}
        onKeyDown={form.handleKeyDown}
      />
    </>
  )
}

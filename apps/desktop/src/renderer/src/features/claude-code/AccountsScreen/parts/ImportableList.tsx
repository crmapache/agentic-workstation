import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../AccountsScreen.module.scss'
import type { ImportableListProps } from '../AccountsScreen.types'
import { SettingsItem } from '../../SettingsItem/SettingsItem'

/** Аккаунты amazing-claude-code, которых здесь ещё нет: взять - без повторного входа. */
export const ImportableList = ({ accounts, busy, onImport }: ImportableListProps) => {
  const { t } = useTranslation()

  if (accounts.length === 0) return null

  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>{t('claudeCode.accounts.fromAccTitle')}</div>
      <ul className={styles.list}>
        {accounts.map((account) => (
          <SettingsItem
            key={account.sourceId}
            title={account.alias || account.email}
            details={[[account.plan, account.email].filter(Boolean).join(' · ')]}
            actions={
              <Button size="sm" disabled={busy} onClick={() => onImport(account.sourceId)}>
                {t('claudeCode.accounts.import')}
              </Button>
            }
          />
        ))}
      </ul>
    </section>
  )
}

import { useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../PluginsScreen.module.scss'
import type { BrowseListProps } from '../PluginsScreen.types'
import { searchPlugins } from '../PluginsScreen.utils'
import { SettingsItem } from '../../SettingsItem/SettingsItem'

/**
 * Каталог маркетплейсов с поиском по имени и описанию. Установка, которой CLI не дал
 * пройти без согласия на команду маркетплейса, получает кнопку «всё равно установить».
 */
export const BrowseList = ({
  available,
  installed,
  busy,
  consentFor,
  onInstall,
}: BrowseListProps) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const found = searchPlugins(available, installed, query)

  return (
    <div className={styles.browse}>
      <TextField
        label={t('claudeCode.plugins.search')}
        hideLabel
        icon={Search}
        value={query}
        placeholder={t('claudeCode.plugins.searchPlaceholder')}
        onChange={setQuery}
      />
      {found.length === 0 && (
        <div className={styles.empty}>{t('claudeCode.plugins.nothingFound')}</div>
      )}
      <ul className={styles.list}>
        {found.map((plugin) => (
          <SettingsItem
            key={plugin.id}
            title={plugin.name}
            meta={t('claudeCode.plugins.installs', { count: plugin.installCount })}
            details={[plugin.marketplace]}
            actions={
              <>
                <Button
                  size="sm"
                  disabled={busy === plugin.id}
                  onClick={() => onInstall(plugin.id, false)}>
                  {t('claudeCode.plugins.install')}
                </Button>
                {consentFor === plugin.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === plugin.id}
                    onClick={() => onInstall(plugin.id, true)}>
                    {t('claudeCode.plugins.installAnyway')}
                  </Button>
                )}
              </>
            }>
            {plugin.description && <div className={styles.description}>{plugin.description}</div>}
          </SettingsItem>
        ))}
      </ul>
    </div>
  )
}

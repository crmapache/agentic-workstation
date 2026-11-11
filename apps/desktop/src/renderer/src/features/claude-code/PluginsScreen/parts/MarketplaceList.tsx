import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../PluginsScreen.module.scss'
import type { MarketplaceListProps } from '../PluginsScreen.types'
import { SettingsItem } from '../../SettingsItem/SettingsItem'

/** Маркетплейсы: откуда каждый, удалить; добавить по адресу, пути или owner/repo. */
export const MarketplaceList = ({ marketplaces, busy, onAdd, onRemove }: MarketplaceListProps) => {
  const { t } = useTranslation()
  const [source, setSource] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!source.trim()) return

    onAdd(source.trim())
    setSource('')
  }

  return (
    <div className={styles.browse}>
      <ul className={styles.list}>
        {marketplaces.map((market) => (
          <SettingsItem
            key={market.name}
            title={market.name}
            details={[market.source]}
            actions={
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === market.name}
                onClick={() => onRemove(market.name)}>
                {t('claudeCode.plugins.removeMarketplace')}
              </Button>
            }
          />
        ))}
      </ul>
      <form className={styles.addRow} onSubmit={handleSubmit}>
        <TextField
          label={t('claudeCode.plugins.marketplaceSource')}
          hideLabel
          value={source}
          placeholder={t('claudeCode.plugins.marketplacePlaceholder')}
          onChange={setSource}
        />
        <Button type="submit" size="sm" disabled={!source.trim() || busy === 'marketplace'}>
          {t('claudeCode.plugins.addMarketplace')}
        </Button>
      </form>
    </div>
  )
}

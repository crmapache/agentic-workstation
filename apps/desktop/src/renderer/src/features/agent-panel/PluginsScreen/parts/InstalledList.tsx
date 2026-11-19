import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'

import styles from '../PluginsScreen.module.scss'
import type { InstalledListProps } from '../PluginsScreen.types'
import { SettingsItem } from '../../SettingsItem/SettingsItem'

/** Установленные плагины: включён ли, откуда и какой версии; включить, обновить, удалить. */
export const InstalledList = ({ plugins, busy, onAction }: InstalledListProps) => {
  const { t } = useTranslation()

  if (plugins.length === 0)
    return <div className={styles.empty}>{t('agentPanel.plugins.noneInstalled')}</div>

  return (
    <ul className={styles.list}>
      {plugins.map((plugin) => {
        const isBusy = busy === plugin.id

        return (
          <SettingsItem
            key={`${plugin.id}:${plugin.scope}`}
            title={plugin.name}
            badges={
              <Badge tone={plugin.enabled ? 'success' : 'neutral'}>
                {plugin.enabled
                  ? t('agentPanel.plugins.enabled')
                  : t('agentPanel.plugins.disabled')}
              </Badge>
            }
            details={[
              [
                plugin.marketplace,
                plugin.version,
                t(`agentPanel.plugins.scopes.${plugin.scope}`, plugin.scope),
              ]
                .filter(Boolean)
                .join(' · '),
            ]}
            actions={
              <>
                <Button
                  size="sm"
                  disabled={isBusy}
                  onClick={() =>
                    onAction(plugin.enabled ? 'disable' : 'enable', plugin.id, plugin.scope)
                  }>
                  {plugin.enabled
                    ? t('agentPanel.plugins.disable')
                    : t('agentPanel.plugins.enable')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isBusy}
                  onClick={() => onAction('update', plugin.id, plugin.scope)}>
                  {t('agentPanel.plugins.update')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isBusy}
                  onClick={() => onAction('uninstall', plugin.id, plugin.scope)}>
                  {t('agentPanel.plugins.uninstall')}
                </Button>
              </>
            }
          />
        )
      })}
    </ul>
  )
}

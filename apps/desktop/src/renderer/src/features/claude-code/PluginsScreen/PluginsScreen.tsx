import { useTranslation } from 'react-i18next'

import { Tabs } from '@agentic-workstation/ui/Tabs'

import type { MenuScreenProps } from '../claude.types'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import { ScreenFailure } from '../ScreenFailure/ScreenFailure'
import { TABS } from './PluginsScreen.constants'
import { usePluginsScreen } from './PluginsScreen.hooks'
import styles from './PluginsScreen.module.scss'
import { BrowseList } from './parts/BrowseList'
import { InstalledList } from './parts/InstalledList'
import { MarketplaceList } from './parts/MarketplaceList'

/**
 * Плагины Claude Code: установленные для этого проекта, каталог маркетплейсов и сами
 * маркетплейсы. Новые и включённые плагины живые разговоры подхватывают сразу - панель
 * просит CLI перечитать плагины.
 */
export const PluginsScreen = ({ project }: MenuScreenProps) => {
  const { t } = useTranslation()
  const screen = usePluginsScreen(project.id)
  const { data, isPending } = screen.catalog

  return (
    <PanelScreen title={t('claudeCode.menu.titles.plugins.title')} notice={screen.notice}>
      <Tabs
        label={t('claudeCode.menu.titles.plugins.title')}
        items={TABS.map((id) => ({ id, label: t(`claudeCode.plugins.tabs.${id}`) }))}
        value={screen.tab}
        onChange={screen.setTab}
      />
      {isPending && <div className={styles.empty}>{t('claudeCode.plugins.loading')}</div>}
      {data?.failure && (
        <ScreenFailure
          failure={data.failure}
          detail={data.detail}
          projectId={project.id}
          onTrusted={screen.refresh}
        />
      )}
      {data && screen.tab === 'installed' && (
        <InstalledList plugins={data.installed} busy={screen.busy} onAction={screen.act} />
      )}
      {data && screen.tab === 'browse' && (
        <BrowseList
          available={data.available}
          installed={data.installed}
          busy={screen.busy}
          consentFor={screen.consentFor}
          onInstall={(pluginId, consent) => screen.act('install', pluginId, '', consent)}
        />
      )}
      {data && screen.tab === 'marketplaces' && (
        <MarketplaceList
          marketplaces={data.marketplaces}
          busy={screen.busy}
          onAdd={screen.addMarketplace}
          onRemove={screen.removeMarketplace}
        />
      )}
    </PanelScreen>
  )
}

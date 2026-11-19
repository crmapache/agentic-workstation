import type {
  Marketplace,
  PluginScope,
  PluginAction,
  AvailablePlugin,
  InstalledPlugin,
} from '@shared/claude-tools'

export type PluginsTab = 'installed' | 'browse' | 'marketplaces'

/** Действие над плагином из строки: что сделать, с каким плагином и в какой области. */
export type PluginActionHandler = (
  action: PluginAction,
  pluginId: string,
  scope: PluginScope | '',
) => void

export type InstalledListProps = {
  plugins: readonly InstalledPlugin[]
  busy: string | null
  onAction: PluginActionHandler
}

export type BrowseListProps = {
  available: readonly AvailablePlugin[]
  installed: readonly InstalledPlugin[]
  busy: string | null
  /** Плагин, установка которого ждёт согласия на команду маркетплейса. */
  consentFor: string | null
  onInstall: (pluginId: string, consent: boolean) => void
}

export type MarketplaceListProps = {
  marketplaces: readonly Marketplace[]
  busy: string | null
  onAdd: (source: string) => void
  onRemove: (name: string) => void
}

/** Что делают на экране: действие над плагином, добавить или удалить маркетплейс. */
export type PluginCommand =
  | {
      kind: 'act'
      request: {
        action: PluginAction
        pluginId: string
        scope: PluginScope | ''
        consent: boolean
      }
    }
  | { kind: 'addMarketplace'; source: string }
  | { kind: 'removeMarketplace'; name: string }
